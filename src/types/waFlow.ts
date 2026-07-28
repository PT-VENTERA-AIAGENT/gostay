// The WhatsApp flow format, as the canvas editor sees it.
//
// These shapes MIRROR api/_lib/wa/flow/types.ts, which is the canonical
// definition — the engine that actually runs a flow lives there. They are
// re-declared rather than imported because api/ is a separate serverless bundle
// the browser build never reaches into (the same split Chatly makes for the same
// reason). src/types/waFlow.parity.test.ts compares the two so a drift fails a
// test instead of silently producing graphs the engine drops on load.
//
// Beyond the wire format, this file also carries what only the EDITOR needs:
// how each node type is presented in the palette and inspector.

export const FLOW_VERSION = 1 as const;

export type NodeType =
  | "trigger" | "message" | "ask" | "choice" | "condition" | "action" | "handoff" | "end";

export type ActionType =
  | "start_booking" | "start_room_service" | "show_room_types" | "show_menu" | "send_portal_link";

export type ConditionOperator = "==" | "!=" | "contains" | "is_set" | "is_empty";

/** Mirrors the wa_flow_requirement enum in migration 037. */
export type FlowRequirement = "none" | "inhouse";

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

/**
 * One node. The editor keeps `data` loose because a single inspector component
 * edits every type; the coercer below is what pins each type's real shape on
 * the way out.
 */
export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    text?: string;
    prompt?: string;
    variable?: string;
    options?: ChoiceOption[];
    operator?: ConditionOperator;
    value?: string;
    action?: ActionType;
  };
}

export interface FlowDefinition {
  version: typeof FLOW_VERSION;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** A row of wa_flows as the console works with it. */
export interface WaFlow {
  id: string;
  name: string;
  description: string | null;
  trigger_keywords: string[];
  requires: FlowRequirement;
  priority: number;
  definition: FlowDefinition;
  is_active: boolean;
  updated_at: string;
}

export function emptyFlow(): FlowDefinition {
  return {
    version: FLOW_VERSION,
    nodes: [{ id: "trigger", type: "trigger", position: { x: 80, y: 80 }, data: {} }],
    edges: [],
  };
}

// ─── Coercion ────────────────────────────────────────────────────────────────

const NODE_TYPES: NodeType[] = [
  "trigger", "message", "ask", "choice", "condition", "action", "handoff", "end",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normalise whatever the column holds into something the editor can render.
 * Never throws — a graph saved by a newer console must open, degraded, rather
 * than white-screen the page. Same stance as coercePlan in floorPlan.ts.
 */
export function coerceFlow(raw: unknown): FlowDefinition {
  if (!isRecord(raw)) return emptyFlow();

  const nodes: FlowNode[] = [];
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  rawNodes.forEach((n, i) => {
    if (!isRecord(n)) return;
    const { id, type } = n;
    if (typeof id !== "string" || typeof type !== "string") return;
    if (!NODE_TYPES.includes(type as NodeType)) return;
    const pos = isRecord(n.position) ? n.position : {};
    nodes.push({
      id,
      type: type as NodeType,
      // A node saved without coordinates would otherwise stack at the origin.
      position: {
        x: typeof pos.x === "number" ? pos.x : 80 + (i % 3) * 300,
        y: typeof pos.y === "number" ? pos.y : 80 + Math.floor(i / 3) * 160,
      },
      data: isRecord(n.data) ? (n.data as FlowNode["data"]) : {},
    });
  });

  const ids = new Set(nodes.map((n) => n.id));
  const edges: FlowEdge[] = [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  for (const e of rawEdges) {
    if (!isRecord(e)) continue;
    const { id, source, target, sourceHandle } = e;
    if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") continue;
    if (!ids.has(source) || !ids.has(target)) continue;
    edges.push({ id, source, target, ...(typeof sourceHandle === "string" ? { sourceHandle } : {}) });
  }

  return { version: FLOW_VERSION, nodes: nodes.length ? nodes : emptyFlow().nodes, edges };
}

// ─── Presentation ────────────────────────────────────────────────────────────

export interface NodeMeta {
  label: string;
  hint: string;
  /** lucide-react icon name, resolved in the component. */
  icon: string;
  /** Tailwind classes for the node body on the canvas. */
  tone: string;
  /** How many labelled outlets this node has. */
  outlets: Array<{ id?: string; label?: string }>;
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  trigger: {
    label: "Mulai", hint: "Titik awal. Kata pemicunya diatur di panel Pengaturan, bukan di sini.",
    icon: "Play", tone: "border-emerald-300 bg-emerald-50", outlets: [{}],
  },
  message: {
    label: "Kirim Pesan", hint: "Kirim satu pesan, lalu lanjut ke node berikutnya.",
    icon: "MessageSquare", tone: "border-sky-300 bg-sky-50", outlets: [{}],
  },
  ask: {
    label: "Tanya & Simpan", hint: "Ajukan pertanyaan, tunggu jawaban tamu, simpan ke variabel.",
    icon: "HelpCircle", tone: "border-violet-300 bg-violet-50", outlets: [{}],
  },
  choice: {
    label: "Pilihan Bernomor", hint: "Tawarkan opsi bernomor. Satu cabang per opsi.",
    icon: "ListOrdered", tone: "border-amber-300 bg-amber-50", outlets: [],
  },
  condition: {
    label: "Kondisi", hint: "Bercabang berdasarkan nilai variabel.",
    icon: "GitBranch", tone: "border-orange-300 bg-orange-50",
    outlets: [{ id: "true", label: "Ya" }, { id: "false", label: "Tidak" }],
  },
  action: {
    label: "Aksi Hotel", hint: "Jalankan kemampuan bawaan: pesan kamar, room service, daftar harga.",
    icon: "Zap", tone: "border-indigo-300 bg-indigo-50", outlets: [{}],
  },
  handoff: {
    label: "Alihkan ke Staf", hint: "Hentikan bot dan serahkan percakapan ke manusia.",
    icon: "UserRound", tone: "border-rose-300 bg-rose-50", outlets: [],
  },
  end: {
    label: "Selesai", hint: "Ucapkan penutup dan akhiri percakapan.",
    icon: "CircleCheckBig", tone: "border-slate-300 bg-slate-100", outlets: [],
  },
};

/** Palette order — trigger is excluded because every flow already has one. */
export const PALETTE: NodeType[] = ["message", "ask", "choice", "condition", "action", "handoff", "end"];

export const ACTION_META: Record<ActionType, { label: string; hint: string; takesOver: boolean }> = {
  start_booking: {
    label: "Mulai pemesanan kamar",
    hint: "Menyerahkan tamu ke percakapan pemesanan: tanggal, tipe kamar, harga, konfirmasi, lalu tautan pembayaran.",
    takesOver: true,
  },
  start_room_service: {
    label: "Mulai pesan room service",
    hint: "Menampilkan menu POS dan menerima pesanan. Hanya untuk tamu yang sudah check-in.",
    takesOver: true,
  },
  show_room_types: {
    label: "Tampilkan kamar & harga",
    hint: "Mengirim daftar tipe kamar beserta tarif per malam. Alur tetap berlanjut.",
    takesOver: false,
  },
  show_menu: {
    label: "Tampilkan menu (tanpa pesan)",
    hint: "Mengirim daftar menu POS saja, tanpa membuka pemesanan.",
    takesOver: false,
  },
  send_portal_link: {
    label: "Kirim tautan portal tamu",
    hint: "Mengirim tautan portal hotel ini agar tamu bisa memantau pesanannya.",
    takesOver: false,
  },
};

export const REQUIREMENT_META: Record<FlowRequirement, { label: string; hint: string }> = {
  none: { label: "Semua orang", hint: "Siapa pun boleh memicu alur ini, termasuk calon tamu." },
  inhouse: {
    label: "Hanya tamu menginap",
    hint: "Hanya tamu yang sudah check-in. Inilah yang membuat kata seperti “menu” " +
      "membuka room service untuk tamu menginap, dan jatuh ke alur sapaan untuk calon tamu.",
  },
};
