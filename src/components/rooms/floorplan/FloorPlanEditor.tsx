import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DoorOpen, Trees, Waves, Landmark, Route, CircleParking, Shapes,
  ZoomIn, ZoomOut, Maximize, Grid3x3, Magnet, Save, Loader2, Spline, MousePointer2,
  Download, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";
import { useRooms } from "@/hooks/useRooms";
import { useFloorPlan, useSaveFloorPlan } from "@/hooks/useFloorPlan";
import ElementInspector from "./ElementInspector";
import {
  CATEGORY_META, CATEGORY_ORDER, coercePlan, emptyPlan, regularPolygonPoints,
  type PlanCategory, type PlanElement, type SitePlan,
} from "@/types/floorPlan";

// Icon lookup for category toolbar buttons.
const CAT_ICON: Record<PlanCategory, typeof DoorOpen> = {
  room: DoorOpen, garden: Trees, pool: Waves, mosque: Landmark, road: Route, parking: CircleParking, custom: Shapes,
};

let seq = 0;
function newId() {
  // Plan-local id; crypto.randomUUID keeps it collision-free across sessions.
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `el-${Date.now()}-${seq++}`;
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Drag =
  | { kind: "move"; id: string; startX: number; startY: number; ox: number; oy: number; moved: boolean }
  | { kind: "resize"; id: string; handle: Handle; box: { x: number; y: number; w: number; h: number } }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "pan"; startX: number; startY: number; tx: number; ty: number };

export default function FloorPlanEditor() {
  const { toast } = useToast();
  const { data: rooms = [] } = useRooms();
  const { data: serverPlan, isLoading } = useFloorPlan();
  const save = useSaveFloorPlan();

  const [plan, setPlan] = useState<SitePlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vertexMode, setVertexMode] = useState(false);
  const [snap, setSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // View transform: screen = plan * zoom + t.
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const fittedRef = useRef(false);

  // Load server plan into the working copy until the user starts editing.
  useEffect(() => {
    if (!dirty && serverPlan !== undefined) setPlan(serverPlan ?? emptyPlan());
  }, [serverPlan, dirty]);

  // Measure the canvas viewport.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (!plan || size.w === 0) return;
    const z = Math.min(size.w / plan.width, size.h / plan.height) * 0.9;
    setZoom(z);
    setTx((size.w - plan.width * z) / 2);
    setTy((size.h - plan.height * z) / 2);
  }, [plan, size]);

  // Fit once, after both the plan and the viewport are known.
  useEffect(() => {
    if (!fittedRef.current && plan && size.w > 0) {
      fittedRef.current = true;
      fitView();
    }
  }, [plan, size, fitView]);

  const selected = plan?.elements.find((e) => e.id === selectedId) ?? null;
  const usedRoomIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of plan?.elements ?? []) if (e.roomId) s.add(e.roomId);
    return s;
  }, [plan]);

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  // ─── plan mutation helpers ──────────────────────────────────────────────────
  const patchElement = useCallback((id: string, patch: Partial<PlanElement>) => {
    setDirty(true);
    setPlan((p) => (p ? { ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : p));
  }, []);

  const removeElement = useCallback((id: string) => {
    setDirty(true);
    setPlan((p) => (p ? { ...p, elements: p.elements.filter((e) => e.id !== id) } : p));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  const addElement = useCallback((category: PlanCategory) => {
    if (!plan) return;
    const meta = CATEGORY_META[category];
    // Drop it at the centre of the current viewport, snapped.
    const cx = (size.w / 2 - tx) / zoom;
    const cy = (size.h / 2 - ty) / zoom;
    const g = snap ? plan.gridSize : 1;
    const x = Math.round((cx - meta.defaultSize.w / 2) / g) * g;
    const y = Math.round((cy - meta.defaultSize.h / 2) / g) * g;
    const el: PlanElement = {
      id: newId(),
      category,
      shape: meta.defaultShape,
      x, y,
      w: meta.defaultSize.w,
      h: meta.defaultSize.h,
      rotation: 0,
      color: meta.fill,
      points: meta.defaultShape === "polygon" ? regularPolygonPoints(5) : undefined,
    };
    setDirty(true);
    setPlan((p) => (p ? { ...p, elements: [...p.elements, el] } : p));
    setSelectedId(el.id);
    setVertexMode(false);
  }, [plan, size, tx, ty, zoom, snap]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const g = snap ? (plan?.gridSize ?? 20) : 20;
    const copy: PlanElement = { ...selected, id: newId(), x: selected.x + g, y: selected.y + g, points: selected.points ? selected.points.map((pt) => ({ ...pt })) : undefined };
    setDirty(true);
    setPlan((p) => (p ? { ...p, elements: [...p.elements, copy] } : p));
    setSelectedId(copy.id);
  }, [selected, snap, plan]);

  // ─── coordinate + snap helpers ──────────────────────────────────────────────
  const toPlan = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - tx) / zoom, y: (clientY - rect.top - ty) / zoom };
  }, [tx, ty, zoom]);

  const snapV = useCallback((v: number) => {
    if (!snap || !plan) return v;
    return Math.round(v / plan.gridSize) * plan.gridSize;
  }, [snap, plan]);

  // ─── pointer interactions ───────────────────────────────────────────────────
  function onElementPointerDown(e: React.PointerEvent, el: PlanElement) {
    e.stopPropagation();
    setSelectedId(el.id);
    if (vertexMode) return; // vertex handles own the pointer in that mode
    const p = toPlan(e.clientX, e.clientY);
    dragRef.current = { kind: "move", id: el.id, startX: p.x, startY: p.y, ox: el.x, oy: el.y, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onHandlePointerDown(e: React.PointerEvent, el: PlanElement, handle: Handle) {
    e.stopPropagation();
    dragRef.current = { kind: "resize", id: el.id, handle, box: { x: el.x, y: el.y, w: el.w, h: el.h } };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onVertexPointerDown(e: React.PointerEvent, el: PlanElement, index: number) {
    e.stopPropagation();
    setSelectedId(el.id);
    dragRef.current = { kind: "vertex", id: el.id, index };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onBackgroundPointerDown(e: React.PointerEvent) {
    setSelectedId(null);
    setVertexMode(false);
    dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, tx, ty };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "pan") {
      setTx(d.tx + (e.clientX - d.startX));
      setTy(d.ty + (e.clientY - d.startY));
      return;
    }
    const p = toPlan(e.clientX, e.clientY);
    if (d.kind === "move") {
      d.moved = true;
      patchElement(d.id, { x: snapV(d.ox + (p.x - d.startX)), y: snapV(d.oy + (p.y - d.startY)) });
    } else if (d.kind === "resize") {
      const b = d.box;
      const right = b.x + b.w, bottom = b.y + b.h;
      let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
      if (d.handle.includes("w")) { nx = snapV(p.x); nw = right - nx; }
      if (d.handle.includes("e")) { nw = snapV(p.x) - b.x; }
      if (d.handle.includes("n")) { ny = snapV(p.y); nh = bottom - ny; }
      if (d.handle.includes("s")) { nh = snapV(p.y) - b.y; }
      if (nw < 10) { if (d.handle.includes("w")) nx = right - 10; nw = 10; }
      if (nh < 10) { if (d.handle.includes("n")) ny = bottom - 10; nh = 10; }
      patchElement(d.id, { x: nx, y: ny, w: nw, h: nh });
    } else if (d.kind === "vertex") {
      const el = plan?.elements.find((x) => x.id === d.id);
      if (!el || !el.points) return;
      const fx = Math.min(1, Math.max(0, (p.x - el.x) / el.w));
      const fy = Math.min(1, Math.max(0, (p.y - el.y) / el.h));
      const points = el.points.map((pt, i) => (i === d.index ? { x: fx, y: fy } : pt));
      patchElement(d.id, { points });
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (dragRef.current && svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    // Zoom toward the cursor. (No preventDefault — the listener is passive; the
    // page doesn't scroll because the canvas fills the area.)
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const planX = (mx - tx) / zoom, planY = (my - ty) / zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nz = Math.min(4, Math.max(0.15, zoom * factor));
    setZoom(nz);
    setTx(mx - planX * nz);
    setTy(my - planY * nz);
  }

  // Keyboard: Delete removes selection, Escape deselects. Ignored while typing.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (ev.key === "Escape") { setSelectedId(null); setVertexMode(false); }
      if ((ev.key === "Delete" || ev.key === "Backspace") && selectedId) {
        ev.preventDefault();
        removeElement(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, removeElement]);

  function handleSave() {
    if (!plan) return;
    save.mutate(plan, {
      onSuccess: () => {
        setDirty(false);
        toast({ title: tr("Denah tersimpan") });
      },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : "Gagal menyimpan denah.";
        toast({ variant: "destructive", title: tr("Gagal menyimpan denah"), description: /row-level|42501|permission/i.test(msg) ? tr("Anda tidak punya izin mengubah denah.") : msg });
      },
    });
  }

  function handleExport() {
    if (!plan) return;
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gostay-denah-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast({ title: tr("Desain denah diekspor") });
  }

  async function handleImport(file: File) {
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || !Array.isArray((raw as { elements?: unknown }).elements)) {
        throw new Error("Format denah tidak valid.");
      }
      const imported = coercePlan(raw);
      const roomIds = new Set(rooms.map((r) => r.id));
      // A template may come from another hotel. Preserve matching links and
      // detach unknown room ids so the imported design never points at another
      // tenant's rooms or renders misleading status badges.
      const safePlan: SitePlan = {
        ...imported,
        elements: imported.elements.map((el) => ({
          ...el,
          roomId: el.roomId && roomIds.has(el.roomId) ? el.roomId : (el.roomId ? null : el.roomId),
        })),
      };
      setPlan(safePlan);
      setDirty(true);
      setSelectedId(null);
      setVertexMode(false);
      toast({ title: tr("Desain denah diimpor"), description: tr("Periksa lalu tekan Simpan untuk menerapkannya.") });
    } catch (err) {
      const message = err instanceof Error ? err.message : "File denah tidak dapat dibaca.";
      toast({ variant: "destructive", title: tr("Gagal mengimpor denah"), description: message });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  if (isLoading || !plan) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const strokeW = 1 / zoom;

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-[calc(100vh-13rem)] min-h-[520px]">
      {/* ─── Canvas column ─── */}
      <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap p-2 border-b border-border bg-muted/40">
          <span className="text-xs font-medium text-muted-foreground px-1 hidden sm:inline">Tambah:</span>
          {CATEGORY_ORDER.map((c) => {
            const Icon = CAT_ICON[c];
            return (
              <button
                key={c}
                onClick={() => addElement(c)}
                title={`Tambah ${CATEGORY_META[c].label}`}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted transition-colors btn-press"
              >
                <Icon className="w-3.5 h-3.5" style={{ color: CATEGORY_META[c].stroke }} />
                <span className="hidden md:inline">{CATEGORY_META[c].label}</span>
              </button>
            );
          })}

          <div className="w-px h-6 bg-border mx-1" />

          <ToolToggle active={snap} onClick={() => setSnap((s) => !s)} title="Snap ke grid"><Magnet className="w-4 h-4" /></ToolToggle>
          <ToolToggle active={showGrid} onClick={() => setShowGrid((s) => !s)} title="Tampilkan grid"><Grid3x3 className="w-4 h-4" /></ToolToggle>

          <div className="w-px h-6 bg-border mx-1" />

          <ToolToggle active={false} onClick={() => setZoom((z) => Math.max(0.15, z / 1.15))} title="Perkecil"><ZoomOut className="w-4 h-4" /></ToolToggle>
          <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolToggle active={false} onClick={() => setZoom((z) => Math.min(4, z * 1.15))} title="Perbesar"><ZoomIn className="w-4 h-4" /></ToolToggle>
          <ToolToggle active={false} onClick={fitView} title="Paskan ke layar"><Maximize className="w-4 h-4" /></ToolToggle>

          <div className="ml-auto flex items-center gap-2">
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
            <button
              onClick={() => importRef.current?.click()}
              title="Impor desain JSON"
              className="inline-flex items-center gap-1.5 border border-border bg-background text-foreground px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-muted transition-colors btn-press"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Impor</span>
            </button>
            <button
              onClick={handleExport}
              disabled={!plan}
              title="Ekspor desain JSON"
              className="inline-flex items-center gap-1.5 border border-border bg-background text-foreground px-2.5 py-1.5 rounded-md text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50 btn-press"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Ekspor</span>
            </button>
            {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Belum disimpan</span>}
            <button
              onClick={handleSave}
              disabled={save.isPending || !dirty}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 btn-press"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Simpan
            </button>
          </div>
        </div>

        {/* SVG canvas */}
        <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-[#fafaf9] dark:bg-neutral-900 touch-none">
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="block cursor-grab active:cursor-grabbing select-none"
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={onWheel}
          >
            <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
              {/* plan area + grid */}
              <rect x={0} y={0} width={plan.width} height={plan.height} fill="var(--plan-bg, #ffffff)" stroke="#d4d4d8" strokeWidth={strokeW} />
              {showGrid && <GridLines width={plan.width} height={plan.height} step={plan.gridSize} strokeW={strokeW} />}

              {plan.elements.map((el) => (
                <ElementView
                  key={el.id}
                  el={el}
                  selected={el.id === selectedId}
                  vertexMode={vertexMode && el.id === selectedId}
                  strokeW={strokeW}
                  zoom={zoom}
                  roomLabel={el.roomId ? roomById.get(el.roomId)?.number : undefined}
                  onPointerDown={(e) => onElementPointerDown(e, el)}
                  onHandleDown={(e, h) => onHandlePointerDown(e, el, h)}
                  onVertexDown={(e, i) => onVertexPointerDown(e, el, i)}
                />
              ))}
            </g>
          </svg>

          {plan.elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center px-6">
                <Shapes className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">Denah masih kosong</p>
                <p className="text-xs text-muted-foreground">Gunakan tombol “Tambah” di atas untuk menaruh bangunan, taman, kolam, dan lainnya.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Side panel ─── */}
      <div className="lg:w-72 shrink-0 rounded-xl border border-border bg-card p-3 md:p-4 overflow-y-auto">
        {selected ? (
          <div className="space-y-3">
            {selected.shape === "polygon" && (
              <button
                onClick={() => setVertexMode((v) => !v)}
                disabled={selected.rotation !== 0}
                title={selected.rotation !== 0 ? "Setel putaran ke 0° untuk mengedit titik" : undefined}
                className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 ${
                  vertexMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {vertexMode ? <Spline className="w-4 h-4" /> : <MousePointer2 className="w-4 h-4" />}
                {vertexMode ? "Mode Titik aktif" : "Edit titik sudut"}
              </button>
            )}
            <ElementInspector
              element={selected}
              rooms={rooms}
              usedRoomIds={usedRoomIds}
              onChange={(patch) => patchElement(selected.id, patch)}
              onDelete={() => removeElement(selected.id)}
              onDuplicate={duplicateSelected}
            />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">Editor Denah</p>
            <p>Klik sebuah elemen untuk mengubah propertinya, atau seret latar untuk menggeser tampilan.</p>
            <ul className="space-y-1.5 text-xs">
              <li>• Seret elemen untuk memindahkan.</li>
              <li>• Seret gagang sudut untuk mengubah ukuran.</li>
              <li>• Scroll untuk zoom, seret latar untuk pan.</li>
              <li>• Tombol Delete menghapus elemen terpilih.</li>
            </ul>
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-medium text-foreground mb-1.5">Legenda</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORY_ORDER.map((c) => (
                  <div key={c} className="flex items-center gap-1.5 text-xs">
                    <span className="w-3 h-3 rounded-sm border" style={{ background: CATEGORY_META[c].fill, borderColor: CATEGORY_META[c].stroke }} />
                    {CATEGORY_META[c].label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolToggle({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md border transition-colors btn-press ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function GridLines({ width, height, step, strokeW }: { width: number; height: number; step: number; strokeW: number }) {
  const lines: React.ReactNode[] = [];
  for (let x = step; x < width; x += step) {
    lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#e7e5e4" strokeWidth={strokeW} />);
  }
  for (let y = step; y < height; y += step) {
    lines.push(<line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#e7e5e4" strokeWidth={strokeW} />);
  }
  return <g>{lines}</g>;
}

// ─── One element (shape + label + selection chrome) ───────────────────────────
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function ElementView({
  el, selected, vertexMode, strokeW, zoom, roomLabel,
  onPointerDown, onHandleDown, onVertexDown,
}: {
  el: PlanElement;
  selected: boolean;
  vertexMode: boolean;
  strokeW: number;
  zoom: number;
  roomLabel?: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onHandleDown: (e: React.PointerEvent, h: Handle) => void;
  onVertexDown: (e: React.PointerEvent, i: number) => void;
}) {
  const meta = CATEGORY_META[el.category];
  const fill = el.color ?? meta.fill;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const label = el.label || (roomLabel ? `Kamar ${roomLabel}` : meta.label);
  const fontSize = Math.max(9, Math.min(el.h * 0.28, (el.w / Math.max(4, label.length)) * 1.6, 22));

  const shapeProps = { fill, stroke: meta.stroke, strokeWidth: strokeW * 1.5, style: { cursor: "move" as const } };

  let shapeEl: React.ReactNode;
  if (el.shape === "circle") {
    shapeEl = <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...shapeProps} />;
  } else if (el.shape === "triangle") {
    shapeEl = <polygon points={`${cx},${el.y} ${el.x + el.w},${el.y + el.h} ${el.x},${el.y + el.h}`} {...shapeProps} />;
  } else if (el.shape === "polygon" && el.points && el.points.length >= 3) {
    const pts = el.points.map((p) => `${el.x + p.x * el.w},${el.y + p.y * el.h}`).join(" ");
    shapeEl = <polygon points={pts} {...shapeProps} />;
  } else {
    shapeEl = <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={Math.min(6, el.w / 12, el.h / 12)} {...shapeProps} />;
  }

  const hs = 9 / zoom; // handle size, ~constant on screen

  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <g onPointerDown={onPointerDown}>
        {shapeEl}
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fill={meta.text} fontWeight={600}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      </g>

      {selected && (
        <>
          {/* selection outline */}
          <rect
            x={el.x} y={el.y} width={el.w} height={el.h}
            fill="none" stroke="#2563eb" strokeWidth={strokeW * 1.5}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            style={{ pointerEvents: "none" }}
          />
          {/* resize handles — only axis-aligned (hidden when rotated), and not in vertex mode */}
          {!vertexMode && el.rotation === 0 && HANDLES.map((h) => {
            const pos = handlePos(el, h);
            return (
              <rect
                key={h}
                x={pos.x - hs / 2} y={pos.y - hs / 2} width={hs} height={hs}
                fill="#ffffff" stroke="#2563eb" strokeWidth={strokeW}
                style={{ cursor: `${h}-resize` }}
                onPointerDown={(e) => onHandleDown(e, h)}
              />
            );
          })}
          {/* polygon vertex handles */}
          {vertexMode && el.shape === "polygon" && el.points?.map((p, i) => (
            <circle
              key={i}
              cx={el.x + p.x * el.w} cy={el.y + p.y * el.h} r={hs / 1.6}
              fill="#2563eb" stroke="#ffffff" strokeWidth={strokeW}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onVertexDown(e, i)}
            />
          ))}
        </>
      )}
    </g>
  );
}

function handlePos(el: PlanElement, h: Handle) {
  const l = el.x, r = el.x + el.w, t = el.y, b = el.y + el.h;
  const mx = el.x + el.w / 2, my = el.y + el.h / 2;
  switch (h) {
    case "nw": return { x: l, y: t };
    case "n": return { x: mx, y: t };
    case "ne": return { x: r, y: t };
    case "e": return { x: r, y: my };
    case "se": return { x: r, y: b };
    case "s": return { x: mx, y: b };
    case "sw": return { x: l, y: b };
    case "w": return { x: l, y: my };
  }
}
