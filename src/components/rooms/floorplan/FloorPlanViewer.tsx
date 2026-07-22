import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize, MapPin, X, ArrowRight } from "lucide-react";
import type { RoomWithType } from "@/types/database.types";
import type { RoomStatus } from "@/lib/roomStatus";
import {
  CATEGORY_META, coercePlan, type PlanElement, type SitePlan,
} from "@/types/floorPlan";

// Status → how a linked "room" element is coloured and labelled on the map.
// Mirrors the Room Status Board so the denah reads the same way the grid does.
export const STATUS_STYLE: Record<RoomStatus, { fill: string; stroke: string; text: string; label: string }> = {
  available:      { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d", label: "Tersedia" },
  reserved:       { fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12", label: "Dipesan" },
  checked_in:     { fill: "#dbeafe", stroke: "#2563eb", text: "#1e3a8a", label: "Ditempati" },
  occupied:       { fill: "#e0f2fe", stroke: "#0284c7", text: "#075985", label: "Terisi" },
  out_of_service: { fill: "#f3f4f6", stroke: "#9ca3af", text: "#4b5563", label: "Nonaktif" },
};

const STATUS_ORDER: RoomStatus[] = ["available", "reserved", "checked_in", "occupied", "out_of_service"];

function formatIDR(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

interface Props {
  /** The site plan JSON (already coerced, or raw — we coerce defensively). */
  plan: SitePlan | unknown;
  /** Active rooms with their type, to resolve a linked element's number/type/price. */
  rooms: RoomWithType[];
  /** room_id → live status, for colouring room elements. */
  statusByRoom?: Map<string, RoomStatus>;
  /** room_id → occupant label. Staff only — never pass on the public portal. */
  occupantByRoom?: Map<string, string>;
  /** "guest" hides occupants and only lets AVAILABLE rooms be picked. */
  mode: "staff" | "guest";
  /** Called when a room element is chosen (guest: only when available). */
  onPickRoom?: (room: RoomWithType) => void;
  /** Short caption under the legend, e.g. the date the status reflects. */
  caption?: string;
}

export default function FloorPlanViewer({
  plan: rawPlan, rooms, statusByRoom, occupantByRoom, mode, onPickRoom, caption,
}: Props) {
  const plan = useMemo(() => coercePlan(rawPlan), [rawPlan]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const movedRef = useRef(false);
  const fittedRef = useRef(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (size.w === 0) return;
    const z = Math.min(size.w / plan.width, size.h / plan.height) * 0.92;
    setZoom(z);
    setTx((size.w - plan.width * z) / 2);
    setTy((size.h - plan.height * z) / 2);
  }, [plan, size]);

  useEffect(() => {
    if (!fittedRef.current && size.w > 0) {
      fittedRef.current = true;
      fitView();
    }
  }, [size, fitView]);

  function onPointerDown(e: React.PointerEvent) {
    panRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    movedRef.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = panRef.current;
    if (!p) return;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 3) movedRef.current = true;
    setTx(p.tx + (e.clientX - p.x));
    setTy(p.ty + (e.clientY - p.y));
  }
  function endPan(e: React.PointerEvent) {
    if (panRef.current && svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    panRef.current = null;
  }
  function onBackgroundClick() {
    if (!movedRef.current) setSelectedId(null);
  }
  function onWheel(e: React.WheelEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const planX = (mx - tx) / zoom, planY = (my - ty) / zoom;
    const nz = Math.min(4, Math.max(0.15, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setZoom(nz); setTx(mx - planX * nz); setTy(my - planY * nz);
  }

  function clickElement(el: PlanElement) {
    if (movedRef.current) return; // a drag, not a click
    setSelectedId(el.id);
  }

  const selected = plan.elements.find((e) => e.id === selectedId) ?? null;
  const selectedRoom = selected?.roomId ? roomById.get(selected.roomId) ?? null : null;
  const selectedStatus = selectedRoom ? statusByRoom?.get(selectedRoom.id) : undefined;
  const canPick = mode === "staff" || selectedStatus === "available";

  const strokeW = 1 / zoom;

  return (
    <div className="relative w-full h-full rounded-xl border border-border overflow-hidden bg-[#fafaf9] dark:bg-neutral-900">
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg border border-border p-1 shadow-sm">
        <button onClick={() => setZoom((z) => Math.max(0.15, z / 1.15))} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Perkecil"><ZoomOut className="w-4 h-4" /></button>
        <span className="text-xs text-muted-foreground tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z * 1.15))} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Perbesar"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={fitView} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Paskan ke layar"><Maximize className="w-4 h-4" /></button>
      </div>

      {/* Legend */}
      <div className="absolute top-3 left-3 z-10 bg-card/90 backdrop-blur rounded-lg border border-border p-2.5 shadow-sm max-w-[13rem]">
        <p className="text-[11px] font-semibold text-foreground mb-1.5">Status kamar</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {STATUS_ORDER.filter((s) => mode === "staff" || s === "available" || s === "reserved").map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm border" style={{ background: STATUS_STYLE[s].fill, borderColor: STATUS_STYLE[s].stroke }} />
              {mode === "guest" && s === "reserved" ? "Penuh" : STATUS_STYLE[s].label}
            </div>
          ))}
        </div>
        {caption && <p className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border">{caption}</p>}
      </div>

      <div ref={wrapRef} className="w-full h-full touch-none">
        <svg
          ref={svgRef}
          width={size.w}
          height={size.h}
          className="block cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClick={onBackgroundClick}
          onWheel={onWheel}
        >
          <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
            <rect x={0} y={0} width={plan.width} height={plan.height} fill="#ffffff" stroke="#e5e7eb" strokeWidth={strokeW} />
            {plan.elements.map((el) => (
              <ViewerElement
                key={el.id}
                el={el}
                room={el.roomId ? roomById.get(el.roomId) ?? null : null}
                status={el.roomId ? statusByRoom?.get(el.roomId) : undefined}
                selected={el.id === selectedId}
                strokeW={strokeW}
                onClick={() => clickElement(el)}
              />
            ))}
          </g>
        </svg>
      </div>

      {plan.elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6">
            <MapPin className="w-9 h-9 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Denah belum tersedia</p>
            <p className="text-xs text-muted-foreground">Hotel ini belum membuat denah lokasi.</p>
          </div>
        </div>
      )}

      {/* Detail card for the selected element */}
      {selected && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-80 z-10 bg-card rounded-xl border border-border shadow-lg p-4">
          <button onClick={() => setSelectedId(null)} className="absolute top-3 right-3 p-1 rounded-md hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          {selectedRoom ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">Kamar {selectedRoom.number}</span>
                {selectedStatus && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: STATUS_STYLE[selectedStatus].fill, color: STATUS_STYLE[selectedStatus].text }}>
                    {mode === "guest" && selectedStatus !== "available" ? "Penuh" : STATUS_STYLE[selectedStatus].label}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{selectedRoom.room_types?.name}</p>
              {selectedRoom.room_types?.base_rate != null && (
                <p className="text-sm font-semibold text-foreground">{formatIDR(selectedRoom.room_types.base_rate)} <span className="font-normal text-muted-foreground text-xs">/ malam</span></p>
              )}
              {mode === "staff" && occupantByRoom?.get(selectedRoom.id) && (
                <p className="text-xs text-muted-foreground">Tamu: <span className="text-foreground font-medium">{occupantByRoom.get(selectedRoom.id)}</span></p>
              )}
              {onPickRoom && (
                <button
                  onClick={() => onPickRoom(selectedRoom)}
                  disabled={!canPick}
                  className="mt-1 w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {mode === "guest" ? (canPick ? "Lihat & Pesan" : "Tidak tersedia") : "Buka kamar"}
                  {canPick && <ArrowRight className="w-4 h-4" />}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-base font-bold text-foreground">{selected.label || CATEGORY_META[selected.category].label}</span>
              <p className="text-sm text-muted-foreground">{CATEGORY_META[selected.category].label}</p>
              {selected.category === "room" && <p className="text-xs text-muted-foreground">Belum ditautkan ke kamar.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViewerElement({
  el, room, status, selected, strokeW, onClick,
}: {
  el: PlanElement;
  room: RoomWithType | null;
  status?: RoomStatus;
  selected: boolean;
  strokeW: number;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[el.category];
  // A linked room takes its colour from live status; everything else keeps its
  // category colour so gardens/pools/roads still read as themselves.
  const style = status ? STATUS_STYLE[status] : null;
  const fill = style?.fill ?? el.color ?? meta.fill;
  const stroke = style?.stroke ?? meta.stroke;
  const textColor = style?.text ?? meta.text;

  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  const label = room ? room.number : el.label || meta.label;
  const fontSize = Math.max(9, Math.min(el.h * 0.3, (el.w / Math.max(3, String(label).length)) * 1.6, 24));
  const interactive = Boolean(room);

  const shapeProps = {
    fill, stroke, strokeWidth: strokeW * (selected ? 3 : 1.5),
    style: { cursor: interactive ? "pointer" : "default" as const },
  };

  let shapeEl: React.ReactNode;
  if (el.shape === "circle") {
    shapeEl = <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...shapeProps} />;
  } else if (el.shape === "triangle") {
    shapeEl = <polygon points={`${cx},${el.y} ${el.x + el.w},${el.y + el.h} ${el.x},${el.y + el.h}`} {...shapeProps} />;
  } else if (el.shape === "polygon" && el.points && el.points.length >= 3) {
    shapeEl = <polygon points={el.points.map((p) => `${el.x + p.x * el.w},${el.y + p.y * el.h}`).join(" ")} {...shapeProps} />;
  } else {
    shapeEl = <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={Math.min(6, el.w / 12, el.h / 12)} {...shapeProps} />;
  }

  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`} onClick={interactive ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
      {shapeEl}
      {selected && (
        <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke="#2563eb" strokeWidth={strokeW * 2} strokeDasharray={`${strokeW * 6} ${strokeW * 4}`} style={{ pointerEvents: "none" }} />
      )}
      <text
        x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize} fill={textColor} fontWeight={600}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {label}
      </text>
    </g>
  );
}
