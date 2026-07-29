import { useMemo, useState } from "react";
import { Check, Loader2, MoonStar, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  FLOW_TEMPLATES, CATEGORY_META, CATEGORY_ORDER,
  type FlowTemplate, type TemplateCategory,
} from "../../../api/_lib/wa/flow/templates";
import { useT } from "@/lib/i18n";

/**
 * Browse the ready-made flows and pick which ones to install.
 *
 * Twelve templates is past the point where "install everything" is a sensible
 * default — a hotel with no restaurant does not want a room-service flow, and
 * one that answers its own phone does not want the handoff. So this shows what
 * each template actually does, grouped by what it is for, and installs only
 * what is ticked.
 *
 * Templates the hotel already has are shown but locked: re-installing would
 * either duplicate the name (which the unique index rejects) or overwrite words
 * they have since edited.
 */
export default function TemplatePicker({
  open,
  onOpenChange,
  installedNames,
  onInstall,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Names already in wa_flows, so the dialog can mark them as done. */
  installedNames: Set<string>;
  onInstall: (templates: FlowTemplate[]) => Promise<void>;
}) {
  const t = useT();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const available = useMemo(
    () => FLOW_TEMPLATES.filter((t) => !installedNames.has(t.name)),
    [installedNames],
  );

  const grouped = useMemo(() => {
    const by = new Map<TemplateCategory, FlowTemplate[]>();
    for (const c of CATEGORY_ORDER) by.set(c, []);
    for (const t of FLOW_TEMPLATES) by.get(t.category)?.push(t);
    return by;
  }, []);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function install() {
    setBusy(true);
    try {
      await onInstall(FLOW_TEMPLATES.filter((t) => picked.has(t.key)));
      setPicked(new Set());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("Pilih Template Alur")}</DialogTitle>
          <DialogDescription>
            Semuanya bisa Anda ubah setelah terpasang — kata pemicu, teks balasan, maupun
            alurnya. Template dipasang dalam keadaan <strong>nonaktif</strong>, jadi WhatsApp
            hotel tidak berubah sampai Anda mengaktifkannya sendiri.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-4">
            {CATEGORY_ORDER.map((cat) => {
              const items = grouped.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold">{CATEGORY_META[cat].label}</h3>
                    <p className="text-xs text-muted-foreground">{CATEGORY_META[cat].hint}</p>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <TemplateCard
                        key={t.key}
                        template={t}
                        installed={installedNames.has(t.name)}
                        picked={picked.has(t.key)}
                        onToggle={() => toggle(t.key)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="items-center gap-2 border-t px-6 py-3 sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{picked.size} dipilih</span>
            {available.length > 0 && (
              <Button
                variant="link" size="sm" className="h-auto p-0"
                onClick={() =>
                  setPicked(
                    picked.size === available.length
                      ? new Set()
                      : new Set(available.map((t) => t.key)),
                  )
                }
              >
                {picked.size === available.length ? "Kosongkan" : `Pilih semua (${available.length})`}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={install} disabled={busy || picked.size === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Pasang {picked.size > 0 ? picked.size : ""} Template
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template, installed, picked, onToggle,
}: {
  template: FlowTemplate;
  installed: boolean;
  picked: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const kw = template.triggerKeywords;

  return (
    <button
      type="button"
      onClick={installed ? undefined : onToggle}
      disabled={installed}
      aria-pressed={picked}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        installed
          ? "cursor-default border-dashed bg-muted/40 opacity-70"
          : picked
            ? "border-primary bg-primary/5"
            : "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            picked && !installed && "border-primary bg-primary text-primary-foreground",
            installed && "border-muted-foreground/40",
          )}
        >
          {(picked || installed) && <Check className="h-3 w-3" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{template.name}</span>
            {template.requires === "inhouse" && (
              <Badge className="gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                <MoonStar className="h-3 w-3" />
                Tamu menginap
              </Badge>
            )}
            {installed && <Badge variant="secondary">{t("Sudah terpasang")}</Badge>}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{t("Dipicu oleh:")}</span>
            {kw.slice(0, 5).map((k) => (
              <code key={k} className="rounded bg-muted px-1 py-0.5 text-[11px]">{k}</code>
            ))}
            {kw.length > 5 && (
              <span className="text-[11px] text-muted-foreground">+{kw.length - 5}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
