import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState,
  type Connection, type Edge, type Node, type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Loader2, Save, Trash2, Plus, X } from "lucide-react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import FlowNodeCard, { type FlowNodeData } from "@/components/waflow/FlowNodeCard";
import { fromDefinition, toDefinition } from "@/lib/waFlowGraph";
import { getFlow, updateFlow } from "@/services/waFlowService";
import {
  ACTION_META, NODE_META, PALETTE, REQUIREMENT_META,
  type ActionType, type ConditionOperator, type FlowRequirement,
  type NodeType, type WaFlow,
} from "@/types/waFlow";
import { useT } from "@/lib/i18n";

/**
 * The canvas editor for one flow.
 *
 * ReactFlow owns the working copy while editing; the saved shape is our own
 * FlowDefinition, converted at the boundaries (fromDefinition / toDefinition).
 * Keeping our format separate from ReactFlow's is what lets the engine — which
 * has never heard of ReactFlow — read the same column.
 */

const nodeTypes: NodeTypes = { flowNode: FlowNodeCard };

let seq = 0;
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${seq++}`;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WaFlowEditor() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [flow, setFlow] = useState<WaFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Flow-level settings, edited in the right panel.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [requires, setRequires] = useState<FlowRequirement>("none");
  const [priority, setPriority] = useState(100);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const f = await getFlow(id);
        if (!f) {
          toast({ title: "Alur tidak ditemukan", variant: "destructive" });
          navigate("/settings/wa-flows");
          return;
        }
        setFlow(f);
        setName(f.name);
        setDescription(f.description ?? "");
        setKeywords(f.trigger_keywords);
        setRequires(f.requires);
        setPriority(f.priority);
        setIsActive(f.is_active);
        const { nodes: n, edges: e } = fromDefinition(f.definition);
        setNodes(n);
        setEdges(e);
      } catch (e) {
        toast({ title: "Gagal memuat", description: (e as Error).message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const markDirty = useCallback(() => setDirty(true), []);

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => {
        // One outlet, one edge. A second edge from the same handle would make
        // which branch runs depend on array order — the engine takes the first
        // match, so silently replacing is clearer than silently ignoring.
        const cleaned = eds.filter(
          (e) => !(e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null)),
        );
        return addEdge({ ...c, animated: true }, cleaned);
      });
      markDirty();
    },
    [setEdges, markDirty],
  );

  function addNode(kind: NodeType) {
    const id = newId(kind);
    const seed: Partial<FlowNodeData> =
      kind === "choice"
        ? { text: "Ada yang bisa kami bantu?", options: [{ id: "opt1", label: "Opsi 1" }] }
        : kind === "condition"
          ? { variable: "is_inhouse", operator: "==", value: "ya" }
          : kind === "ask"
            ? { prompt: "Pertanyaan Anda?", variable: "jawaban" }
            : kind === "action"
              ? { action: "show_room_types" as ActionType }
              : { text: "" };

    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "flowNode",
        // Offset each new node so they do not land on top of one another.
        position: { x: 420, y: 80 + ns.length * 40 },
        data: { kind, ...seed } as FlowNodeData,
        deletable: true,
      },
    ]);
    setSelectedId(id);
    markDirty();
  }

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  function patchSelected(patch: Partial<FlowNodeData>) {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
    markDirty();
  }

  function removeSelected() {
    if (!selected || (selected.data as FlowNodeData).kind === "trigger") return;
    setNodes((ns) => ns.filter((n) => n.id !== selectedId));
    setEdges((es) => es.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    markDirty();
  }

  async function save() {
    if (!flow) return;
    setSaving(true);
    try {
      await updateFlow(flow.id, {
        name: name.trim() || flow.name,
        description: description.trim() || null,
        trigger_keywords: keywords,
        requires,
        priority,
        is_active: isActive,
        definition: toDefinition(nodes, edges),
      });
      setDirty(false);
      toast({ title: "Tersimpan" });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const activationBlocked = isActive && keywords.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings/wa-flows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          className="h-8 w-56 font-medium"
          aria-label={t("Nama alur")}
        />
        <div className="ml-auto flex items-center gap-3">
          {dirty && <span className="text-xs text-muted-foreground">{t("Belum disimpan")}</span>}
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={(v) => { setIsActive(v); markDirty(); }}
              aria-label={t("Aktifkan alur")}
            />
            <span className="text-sm">{isActive ? "Aktif" : "Nonaktif"}</span>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan
          </Button>
        </div>
      </header>

      {activationBlocked && (
        <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Alur ini aktif tetapi belum punya kata pemicu, jadi tidak akan pernah terpanggil.
          Tambahkan kata pemicu di panel kanan.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Palette ───────────────────────────────────────────────────── */}
        <aside className="w-44 shrink-0 space-y-1 overflow-y-auto border-r p-2">
          <p className="px-1 pb-1 text-xs font-semibold uppercase text-muted-foreground">{t("Tambah Node")}</p>
          {PALETTE.map((kind) => {
            const meta = NODE_META[kind];
            const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[meta.icon];
            return (
              <button
                key={kind}
                onClick={() => addNode(kind)}
                title={meta.hint}
                className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {C && <C className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{meta.label}</span>
              </button>
            );
          })}
        </aside>

        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type !== "select")) markDirty(); }}
            onEdgesChange={(c) => { onEdgesChange(c); markDirty(); }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable className="!hidden md:!block" />
          </ReactFlow>
        </div>

        {/* ── Inspector + settings ──────────────────────────────────────── */}
        <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l p-4">
          {selected ? (
            <NodeInspector
              data={selected.data as FlowNodeData}
              onPatch={patchSelected}
              onDelete={removeSelected}
            />
          ) : (
            <FlowSettings
              description={description} setDescription={(v) => { setDescription(v); markDirty(); }}
              keywords={keywords} setKeywords={(v) => { setKeywords(v); markDirty(); }}
              requires={requires} setRequires={(v) => { setRequires(v); markDirty(); }}
              priority={priority} setPriority={(v) => { setPriority(v); markDirty(); }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function NodeInspector({
  data, onPatch, onDelete,
}: {
  data: FlowNodeData;
  onPatch: (p: Partial<FlowNodeData>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const meta = NODE_META[data.kind];
  const options = data.options ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">{meta.label}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
      </div>

      {data.kind === "trigger" && (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Node ini tidak punya pengaturan. Klik area kosong kanvas untuk mengubah kata pemicu dan
          syarat tamu.
        </p>
      )}

      {(data.kind === "message" || data.kind === "handoff" || data.kind === "end") && (
        <Field label={t("Teks pesan")} hint="Gunakan {{hotel_name}} dan {{guest_name}} untuk menyisipkan data.">
          <Textarea
            value={data.text ?? ""}
            onChange={(e) => onPatch({ text: e.target.value })}
            rows={5}
          />
        </Field>
      )}

      {data.kind === "ask" && (
        <>
          <Field label={t("Pertanyaan")}>
            <Textarea value={data.prompt ?? ""} onChange={(e) => onPatch({ prompt: e.target.value })} rows={3} />
          </Field>
          <Field label={t("Simpan jawaban ke")} hint="Nama variabel; bisa dipakai lagi sebagai {{nama}}.">
            <Input value={data.variable ?? ""} onChange={(e) => onPatch({ variable: e.target.value })} />
          </Field>
        </>
      )}

      {data.kind === "choice" && (
        <>
          <Field label={t("Teks pengantar")}>
            <Textarea value={data.text ?? ""} onChange={(e) => onPatch({ text: e.target.value })} rows={3} />
          </Field>
          <Field label={t("Pilihan")} hint="Nomor ditambahkan otomatis. Tiap pilihan punya cabang sendiri.">
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-1">
                  <span className="w-4 text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={o.label}
                    onChange={(e) =>
                      onPatch({
                        options: options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)),
                      })
                    }
                    className="h-8"
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => onPatch({ options: options.filter((x) => x.id !== o.id) })}
                    aria-label={t("Hapus pilihan")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline" size="sm" className="w-full"
                onClick={() =>
                  onPatch({
                    options: [...options, { id: newId("opt"), label: `Opsi ${options.length + 1}` }],
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Tambah pilihan
              </Button>
            </div>
          </Field>
        </>
      )}

      {data.kind === "condition" && (
        <>
          <Field label={t("Variabel")} hint="Contoh: is_inhouse, atau variabel dari node Tanya.">
            <Input value={data.variable ?? ""} onChange={(e) => onPatch({ variable: e.target.value })} />
          </Field>
          <Field label={t("Operator")}>
            <Select
              value={data.operator ?? "=="}
              onValueChange={(v) => onPatch({ operator: v as ConditionOperator })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="==">{t("sama dengan")}</SelectItem>
                <SelectItem value="!=">{t("tidak sama dengan")}</SelectItem>
                <SelectItem value="contains">mengandung</SelectItem>
                <SelectItem value="is_set">{t("ada isinya")}</SelectItem>
                <SelectItem value="is_empty">kosong</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {data.operator !== "is_set" && data.operator !== "is_empty" && (
            <Field label={t("Nilai pembanding")}>
              <Input value={data.value ?? ""} onChange={(e) => onPatch({ value: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {data.kind === "action" && (
        <Field label={t("Aksi")}>
          <Select value={data.action} onValueChange={(v) => onPatch({ action: v as ActionType })}>
            <SelectTrigger><SelectValue placeholder={t("Pilih aksi")} /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ACTION_META) as ActionType[]).map((a) => (
                <SelectItem key={a} value={a}>{ACTION_META[a].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.action && (
            <p className="mt-2 text-xs text-muted-foreground">{ACTION_META[data.action].hint}</p>
          )}
        </Field>
      )}

      {data.kind !== "trigger" && (
        <Button variant="outline" className="w-full text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Hapus node
        </Button>
      )}
    </div>
  );
}

// ─── Flow-level settings ─────────────────────────────────────────────────────

function FlowSettings({
  description, setDescription, keywords, setKeywords,
  requires, setRequires, priority, setPriority,
}: {
  description: string; setDescription: (v: string) => void;
  keywords: string[]; setKeywords: (v: string[]) => void;
  requires: FlowRequirement; setRequires: (v: FlowRequirement) => void;
  priority: number; setPriority: (v: number) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");

  function addKeyword() {
    const k = draft.trim().toLowerCase();
    if (!k || keywords.includes(k)) { setDraft(""); return; }
    setKeywords([...keywords, k]);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">{t("Pengaturan Alur")}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pilih sebuah node untuk mengubah isinya.
        </p>
      </div>

      <Field label={t("Keterangan")} hint="Untuk staf Anda sendiri; tamu tidak melihatnya.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>

      <Field
        label={t("Kata pemicu")}
        hint="Dicocokkan sebagai kata utuh, bukan potongan — “menu” tidak akan terpicu oleh “menunggu”."
      >
        <div className="flex flex-wrap gap-1.5 pb-2">
          {keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
              {k}
              <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} aria-label={`Hapus ${k}`}>
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
            placeholder={t("mis. booking")}
            className="h-8"
          />
          <Button size="sm" variant="outline" onClick={addKeyword}>{t("Tambah")}</Button>
        </div>
      </Field>

      <Field label={t("Syarat tamu")}>
        <Select value={requires} onValueChange={(v) => setRequires(v as FlowRequirement)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(REQUIREMENT_META) as FlowRequirement[]).map((r) => (
              <SelectItem key={r} value={r}>{REQUIREMENT_META[r].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-xs text-muted-foreground">{REQUIREMENT_META[requires].hint}</p>
      </Field>

      <Field
        label={t("Prioritas")}
        hint="Angka lebih kecil diperiksa lebih dulu. Pakai ini bila dua alur berbagi kata pemicu."
      >
        <Input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) || 0)}
        />
      </Field>
    </div>
  );
}

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
