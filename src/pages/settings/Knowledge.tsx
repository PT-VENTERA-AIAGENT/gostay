import { useEffect, useState } from "react";
import { BookOpen, Loader2, Plus, Sparkles, Trash2, X, AlertTriangle } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
  STARTER_KNOWLEDGE, type KnowledgeEntry,
} from "@/services/knowledgeService";

/**
 * The answers the WhatsApp assistant is allowed to give.
 *
 * This page exists because of a specific failure: a model asked a question it
 * has no source for does not say "I don't know" — it invents something
 * plausible, and invents something DIFFERENT next time. Two guests get two
 * policies and the hotel finds out at the front desk. Everything written here
 * is quoted close to verbatim, and anything NOT written here makes the
 * assistant say it does not know and offer a human.
 */
export default function Knowledge() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setEntries(await listKnowledge());
    } catch (e) {
      toast({ title: "Gagal memuat", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function installStarters() {
    setBusy(true);
    try {
      const have = new Set(entries.map((e) => e.topic));
      const todo = STARTER_KNOWLEDGE.filter((s) => !have.has(s.topic));
      if (todo.length === 0) {
        toast({ title: "Semua topik awal sudah ada" });
        return;
      }
      for (const s of todo) await createKnowledge(s);
      await refresh();
      toast({
        title: `${todo.length} topik ditambahkan`,
        description: "Sebagian besar masih berisi placeholder dan nonaktif — isi dulu, lalu aktifkan.",
      });
    } catch (e) {
      toast({ title: "Gagal menambahkan", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function addBlank() {
    setBusy(true);
    try {
      await createKnowledge({
        topic: `Topik Baru ${entries.length + 1}`,
        content: "",
        keywords: [],
        is_active: false,
      });
      await refresh();
    } catch (e) {
      toast({ title: "Gagal menambah", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function save(id: string, patch: Partial<KnowledgeEntry>) {
    try {
      await updateKnowledge(id, patch as never);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" });
      await refresh();
    }
  }

  async function remove(id: string) {
    try {
      await deleteKnowledge(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      toast({ title: "Gagal menghapus", description: (e as Error).message, variant: "destructive" });
    }
  }

  const unfilled = entries.filter((e) => e.is_active && e.content.trim().startsWith("_Isi"));

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <BookOpen className="h-6 w-6 text-primary" />
              Basis Pengetahuan
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Jawaban resmi hotel Anda. Asisten WhatsApp hanya boleh menjawab dari apa yang
              tertulis di sini — untuk pertanyaan yang tidak tercakup, ia mengatakan belum tahu
              dan menawarkan staf, bukan mengarang.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={installStarters} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" />
              Topik Umum
            </Button>
            <Button onClick={addBlank} disabled={busy}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah
            </Button>
          </div>
        </header>

        {unfilled.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {unfilled.length} topik masih berisi teks contoh tetapi sudah aktif
              ({unfilled.map((e) => e.topic).join(", ")}). Tamu akan menerimanya apa adanya —
              isi dulu atau nonaktifkan.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <h2 className="mt-4 font-medium">Belum ada informasi</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Tanpa isi di sini, asisten hanya bisa menjawab soal kamar, tarif, dan ketersediaan.
              Mulai dari {STARTER_KNOWLEDGE.length} topik yang paling sering ditanyakan tamu.
            </p>
            <Button className="mt-5" onClick={installStarters} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" />
              Tambahkan {STARTER_KNOWLEDGE.length} Topik Umum
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} onSave={(p) => save(e.id, p)} onDelete={() => remove(e.id)} />
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}

function EntryCard({
  entry, onSave, onDelete,
}: {
  entry: KnowledgeEntry;
  onSave: (patch: Partial<KnowledgeEntry>) => void;
  onDelete: () => void;
}) {
  const [topic, setTopic] = useState(entry.topic);
  const [content, setContent] = useState(entry.content);
  const [keywords, setKeywords] = useState<string[]>(entry.keywords);
  const [draft, setDraft] = useState("");

  const placeholder = content.trim().startsWith("_Isi");

  function addKeyword() {
    const k = draft.trim().toLowerCase();
    if (!k || keywords.includes(k)) { setDraft(""); return; }
    const next = [...keywords, k];
    setKeywords(next);
    setDraft("");
    onSave({ keywords: next });
  }

  function dropKeyword(k: string) {
    const next = keywords.filter((x) => x !== k);
    setKeywords(next);
    onSave({ keywords: next });
  }

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => topic !== entry.topic && onSave({ topic })}
          className="h-9 flex-1 font-medium"
          aria-label="Topik"
        />
        <div className="flex shrink-0 items-center gap-2">
          {placeholder && <Badge variant="secondary">Belum diisi</Badge>}
          <Switch
            checked={entry.is_active}
            onCheckedChange={(v) => onSave({ is_active: v })}
            aria-label="Aktifkan topik"
          />
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Hapus topik">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">Jawaban</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => content !== entry.content && onSave({ content })}
          rows={3}
          placeholder="Tulis jawabannya seperti Anda menjawab tamu langsung."
        />
        <p className="text-xs text-muted-foreground">
          Dikutip hampir apa adanya ke tamu, jadi tulis sebagai balasan utuh.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Kata pencarian
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
              {k}
              <button onClick={() => dropKeyword(k)} aria-label={`Hapus ${k}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            placeholder="mis. wifi"
            className="h-8"
          />
          <Button size="sm" variant="outline" onClick={addKeyword}>Tambah</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Kata lain yang harus mengarah ke topik ini. Dicocokkan sebagai kata utuh, jadi
          “wifi” tidak akan terpicu oleh kata lain yang kebetulan mengandungnya.
        </p>
      </div>
    </li>
  );
}
