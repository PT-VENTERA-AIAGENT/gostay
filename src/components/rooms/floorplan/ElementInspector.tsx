import { Trash2, Copy, Link2 } from "lucide-react";
import type { RoomWithType } from "@/types/database.types";
import {
  CATEGORY_META, CATEGORY_ORDER, SHAPE_META,
  regularPolygonPoints,
  type PlanElement, type PlanCategory, type PlanShape,
} from "@/types/floorPlan";

interface Props {
  element: PlanElement;
  rooms: RoomWithType[];
  /** roomIds already used by OTHER elements, so we can flag doubles. */
  usedRoomIds: Set<string>;
  onChange: (patch: Partial<PlanElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const field =
  "w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const num = (v: number) => Math.round(v);

export default function ElementInspector({ element, rooms, usedRoomIds, onChange, onDelete, onDuplicate }: Props) {
  const meta = CATEGORY_META[element.category];

  // Switching to polygon needs a starting silhouette; keep existing points otherwise.
  function setShape(shape: PlanShape) {
    if (shape === "polygon" && (!element.points || element.points.length < 3)) {
      onChange({ shape, points: regularPolygonPoints(5) });
    } else {
      onChange({ shape });
    }
  }

  function setCategory(category: PlanCategory) {
    // Adopt the new category's default colour only if the user hadn't overridden it.
    const patch: Partial<PlanElement> = { category };
    if (!element.color || element.color === CATEGORY_META[element.category].fill) {
      patch.color = CATEGORY_META[category].fill;
    }
    onChange(patch);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Properti Elemen</h3>
        <div className="flex items-center gap-1">
          <button onClick={onDuplicate} title="Duplikat" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onDelete} title="Hapus" className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategori</label>
        <select className={field} value={element.category} onChange={(e) => setCategory(e.target.value as PlanCategory)}>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c].label}</option>
          ))}
        </select>
      </div>

      {/* Shape */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Bentuk</label>
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(SHAPE_META) as PlanShape[]).map((s) => (
            <button
              key={s}
              onClick={() => setShape(s)}
              className={`px-1.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                element.shape === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {SHAPE_META[s].label}
            </button>
          ))}
        </div>
        {element.shape === "polygon" && (
          <p className="text-[11px] text-muted-foreground mt-1.5">Titik sudut bisa digeser langsung di kanvas (mode Titik).</p>
        )}
      </div>

      {/* Label */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
        <input
          className={field}
          value={element.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={meta.label}
        />
      </div>

      {/* Room link — only meaningful for buildings/rooms */}
      {element.category === "room" && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
            <Link2 className="w-3.5 h-3.5" /> Tautkan ke kamar
          </label>
          <select
            className={field}
            value={element.roomId ?? ""}
            onChange={(e) => onChange({ roomId: e.target.value || null })}
          >
            <option value="">— Tidak ditautkan —</option>
            {rooms.map((r) => {
              const taken = r.id !== element.roomId && usedRoomIds.has(r.id);
              return (
                <option key={r.id} value={r.id} disabled={taken}>
                  Kamar {r.number}{r.room_types?.name ? ` · ${r.room_types.name}` : ""}{taken ? " (sudah dipakai)" : ""}
                </option>
              );
            })}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">Menghapus elemen tidak menghapus data kamar.</p>
        </div>
      )}

      {/* Colour */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Warna</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={element.color ?? meta.fill}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-8 w-12 rounded border border-input bg-background p-0.5 cursor-pointer"
          />
          <button
            onClick={() => onChange({ color: meta.fill })}
            className="text-xs text-primary font-medium hover:underline"
          >
            Reset ke default kategori
          </button>
        </div>
      </div>

      {/* Geometry */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={num(element.x)} onChange={(v) => onChange({ x: v })} />
        <NumberField label="Y" value={num(element.y)} onChange={(v) => onChange({ y: v })} />
        <NumberField label="Lebar" value={num(element.w)} min={10} onChange={(v) => onChange({ w: Math.max(10, v) })} />
        <NumberField label="Tinggi" value={num(element.h)} min={10} onChange={(v) => onChange({ h: Math.max(10, v) })} />
      </div>

      {/* Rotation */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center justify-between">
          <span>Putaran</span>
          <span className="tabular-nums">{num(element.rotation)}°</span>
        </label>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={element.rotation}
          onChange={(e) => onChange({ rotation: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, min }: { label: string; value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <input
        type="number"
        className={field}
        value={value}
        min={min}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}
