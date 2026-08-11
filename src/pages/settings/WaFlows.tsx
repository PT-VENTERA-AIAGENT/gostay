import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Loader2, Plus, Workflow, Sparkles, Trash2, Pencil, AlertTriangle, CheckCircle2, MoonStar,
} from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  listFlows, createFlow, updateFlow, deleteFlow, blankFlow,
} from "@/services/waFlowService";
import { REQUIREMENT_META, type WaFlow } from "@/types/waFlow";
import TemplatePicker from "@/components/waflow/TemplatePicker";
// The templates live beside the engine that runs them, and are imported here
// rather than copied: the file is pure data with no server-only imports, so a
// single definition serves both the installer and the engine's transcript
// tests. A copy would drift the first time anyone edited one side.
import { FLOW_TEMPLATES, type FlowTemplate } from "@/lib/waFlowTemplates";
// The same routine the bot's selection uses, so the console can never disagree
// with what actually happens to a message.
import { findKeywordClashes } from "@/lib/waFlowSelect";

/**
 * The hotel's WhatsApp script: every flow, in the order the engine evaluates
 * them.
 *
 * The list is deliberately ordered by priority rather than by name or recency,
 * because precedence is the thing that is hard to reason about — two flows can
 * share a keyword, and which one answers depends on this order plus each flow's
 * guest requirement. Showing them in resolution order makes that legible
 * without opening either one.
 */
export default function WaFlows() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<WaFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WaFlow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function refresh() {
    try {
      setFlows(await listFlows());
    } catch (e) {
      toast({
        title: "Gagal memuat alur",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Install exactly the templates the hotel ticked.
   *
   * Skips any whose name is already taken — the unique index would reject it,
   * and overwriting would discard words the hotel has since edited.
   */
  async function installTemplates(chosen: FlowTemplate[]) {
    const existing = new Set(flows.map((f) => f.name));
    const todo = chosen.filter((t) => !existing.has(t.name));
    if (todo.length === 0) return;

    try {
      for (const t of todo) {
        await createFlow({
          name: t.name,
          description: t.description,
          trigger_keywords: t.triggerKeywords,
          requires: t.requires,
          priority: t.priority,
          definition: t.definition as never,
          // Installed switched OFF. A hotel should read the script and press
          // Aktif itself rather than discover that its WhatsApp changed
          // behaviour the moment it clicked a button.
          is_active: false,
        });
      }
      await refresh();
      toast({
        title: `${todo.length} template terpasang`,
        description: "Semuanya masih nonaktif — periksa isinya, lalu aktifkan.",
      });
    } catch (e) {
      toast({ title: "Gagal memasang template", description: (e as Error).message, variant: "destructive" });
      throw e;
    }
  }

  async function toggleActive(flow: WaFlow, next: boolean) {
    // Optimistic: the switch is the whole interaction, so waiting on a round
    // trip before it moves feels broken.
    setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_active: next } : f)));
    try {
      await updateFlow(flow.id, { is_active: next });
    } catch (e) {
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, is_active: !next } : f)));
      toast({ title: "Gagal mengubah status", description: (e as Error).message, variant: "destructive" });
    }
  }

  async function createBlank() {
    setBusy(true);
    try {
      const created = await createFlow(blankFlow(`Alur Baru ${flows.length + 1}`));
      navigate(`/settings/wa-flows/${created.id}`);
    } catch (e) {
      toast({ title: "Gagal membuat alur", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(flow: WaFlow) {
    try {
      await deleteFlow(flow.id);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
      toast({ title: `“${flow.name}” dihapus` });
    } catch (e) {
      toast({ title: "Gagal menghapus", description: (e as Error).message, variant: "destructive" });
    } finally {
      setConfirmDelete(null);
    }
  }

  const activeCount = flows.filter((f) => f.is_active).length;

  // Only ACTIVE flows can shadow one another; an inactive flow never competes,
  // so warning about it would be noise. Precedence order must match what the
  // bot uses, or the warning would name the wrong winner.
  const clashes = useMemo(
    () =>
      findKeywordClashes(
        flows
          .filter((f) => f.is_active)
          .map((f) => ({
            id: f.id,
            name: f.name,
            triggerKeywords: f.trigger_keywords ?? [],
            requires: f.requires,
            priority: f.priority,
          }))
          .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name)),
      ),
    [flows],
  );

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Workflow className="h-6 w-6 text-primary" />
              Alur WhatsApp
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Skrip balasan otomatis hotel Anda. Bot memeriksa alur dari prioritas terkecil ke
              terbesar, dan melewati alur yang syarat tamunya belum terpenuhi — itulah sebabnya kata
              yang sama bisa berujung berbeda untuk tamu menginap dan calon tamu.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setPickerOpen(true)} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" />
              Pilih Template
            </Button>
            <Button onClick={createBlank} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" />
              Alur Baru
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : flows.length === 0 ? (
          <EmptyState onBrowse={() => setPickerOpen(true)} />
        ) : (
          <>
            {clashes.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {clashes.length} kata pemicu dipakai lebih dari satu alur
                  </p>
                  <p className="mt-1">
                    Bot memakai alur berprioritas terkecil yang cocok, jadi alur di bawah ini
                    tidak akan pernah terpicu oleh kata tersebut. Hapus kata itu dari alur yang
                    merebutnya, atau ubah prioritasnya.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {clashes.map((c) => (
                      <li key={`${c.keyword}-${c.shadowedName}`}>
                        <code className="rounded bg-amber-100 px-1 py-0.5">{c.keyword}</code>{" "}
                        direbut <strong>{c.ownerName}</strong>, sehingga{" "}
                        <strong>{c.shadowedName}</strong> tidak terpakai untuk kata ini.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeCount === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Belum ada alur yang aktif, jadi WhatsApp masih memakai balasan bawaan.
                  Aktifkan minimal satu alur agar skrip Anda dipakai.
                </p>
              </div>
            )}
            <ul className="space-y-3">
              {flows.map((flow) => (
                <FlowRow
                  key={flow.id}
                  flow={flow}
                  onToggle={(next) => toggleActive(flow, next)}
                  onDelete={() => setConfirmDelete(flow)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <TemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        installedNames={new Set(flows.map((f) => f.name))}
        onInstall={installTemplates}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus “{confirmDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Alur ini akan dihapus permanen. Percakapan tamu yang sedang berjalan di alur ini akan
              berhenti dan dilayani balasan bawaan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}

function FlowRow({
  flow, onToggle, onDelete,
}: {
  flow: WaFlow;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  const nodeCount = flow.definition.nodes.length;
  const req = REQUIREMENT_META[flow.requires];

  return (
    <li className="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/settings/wa-flows/${flow.id}`}
              className="truncate font-medium hover:underline"
            >
              {flow.name}
            </Link>
            <Badge variant="outline" className="shrink-0 font-mono text-xs">
              #{flow.priority}
            </Badge>
            {flow.requires === "inhouse" && (
              <Badge className="shrink-0 gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                <MoonStar className="h-3 w-3" />
                {req.label}
              </Badge>
            )}
            {flow.is_active ? (
              <Badge className="shrink-0 gap-1 bg-primary/10 text-primary hover:bg-primary/10">
                <CheckCircle2 className="h-3 w-3" />
                Aktif
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">Nonaktif</Badge>
            )}
          </div>

          {flow.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{flow.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {flow.trigger_keywords.length === 0 ? (
              <span className="text-xs italic text-muted-foreground">
                Belum ada kata pemicu — alur ini tidak akan pernah terpanggil.
              </span>
            ) : (
              <>
                {flow.trigger_keywords.slice(0, 6).map((k) => (
                  <code key={k} className="rounded bg-muted px-1.5 py-0.5 text-xs">{k}</code>
                ))}
                {flow.trigger_keywords.length > 6 && (
                  <span className="text-xs text-muted-foreground">
                    +{flow.trigger_keywords.length - 6} lagi
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">{nodeCount} node</span>
          <Switch checked={flow.is_active} onCheckedChange={onToggle} aria-label="Aktifkan alur" />
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/settings/wa-flows/${flow.id}`} aria-label="Ubah alur">
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Hapus alur">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <Workflow className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h2 className="mt-4 font-medium">Belum ada alur</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Tersedia {FLOW_TEMPLATES.length} template siap pakai — reservasi dengan pembayaran di
        chat, request tamu yang menginap, info harga dan lokasi, penanganan keluhan, dan
        lainnya. Pilih yang Anda butuhkan; semuanya bisa diubah.
      </p>
      <Button className="mt-5" onClick={onBrowse}>
        <Sparkles className="mr-2 h-4 w-4" />
        Lihat {FLOW_TEMPLATES.length} Template
      </Button>
    </div>
  );
}

