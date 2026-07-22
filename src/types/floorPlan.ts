// Site plan (denah) data model — the JSON stored whole in floor_plans.data.
//
// A plan is a top-down drawing of the whole property, not just the inside of a
// building: buildings/rooms, gardens, a pool, a mosque, roads, parking and
// freeform custom shapes all live on one canvas. Coordinates are in abstract
// "plan units" (treat as px at zoom 1); the editor scales them to the viewport.

export type PlanShape = "rect" | "circle" | "triangle" | "polygon";

export type PlanCategory =
  | "room"      // a building / bookable room block — may link to a rooms row
  | "garden"    // taman
  | "pool"      // kolam renang
  | "mosque"    // masjid / musholla
  | "road"      // jalan
  | "parking"   // parkir
  | "custom";   // anything else the hotel needs

export interface PlanElement {
  id: string;               // uuid, unique within the plan
  category: PlanCategory;
  shape: PlanShape;
  x: number;                // bounding-box top-left, plan units
  y: number;
  w: number;                // bounding-box size, plan units
  h: number;
  rotation: number;         // degrees, clockwise, about the box centre
  /**
   * Polygon vertices as fractions (0..1) of the bounding box. Only meaningful
   * when shape === "polygon"; ignored otherwise. Lets a polygon resize/rotate
   * with its box while keeping its silhouette.
   */
  points?: Array<{ x: number; y: number }>;
  label?: string;
  /** Optional colour override; falls back to the category's default fill. */
  color?: string;
  /** For a "room" element: the rooms row it represents, if any. */
  roomId?: string | null;
}

export interface SitePlan {
  version: 1;
  /** Logical canvas size in plan units. */
  width: number;
  height: number;
  /** Snap/step size in plan units. */
  gridSize: number;
  elements: PlanElement[];
}

export const PLAN_VERSION = 1 as const;

export function emptyPlan(): SitePlan {
  return { version: PLAN_VERSION, width: 1600, height: 1000, gridSize: 20, elements: [] };
}

/**
 * Normalise whatever came back from the DB (which may be `{}`, an old version,
 * or partial) into a usable SitePlan. Never throws — a broken plan degrades to
 * an empty one rather than crashing the editor.
 */
export function coercePlan(raw: unknown): SitePlan {
  const base = emptyPlan();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<SitePlan>;
  const elements = Array.isArray(r.elements)
    ? r.elements.filter((e): e is PlanElement => !!e && typeof e === "object" && typeof (e as PlanElement).id === "string")
    : [];
  return {
    version: PLAN_VERSION,
    width: typeof r.width === "number" && r.width > 0 ? r.width : base.width,
    height: typeof r.height === "number" && r.height > 0 ? r.height : base.height,
    gridSize: typeof r.gridSize === "number" && r.gridSize > 0 ? r.gridSize : base.gridSize,
    elements,
  };
}

// ─── Category presentation ────────────────────────────────────────────────────
// Colours are plain hex so they can be used both as SVG fills and as swatches;
// they read on the light canvas and are muted enough not to fight the labels.

export interface CategoryMeta {
  label: string;      // Indonesian label shown to staff
  fill: string;       // default fill
  stroke: string;     // border
  text: string;       // label text colour on the fill
  icon: string;       // lucide-react icon name (resolved in the component)
  defaultShape: PlanShape;
  defaultSize: { w: number; h: number };
}

export const CATEGORY_META: Record<PlanCategory, CategoryMeta> = {
  room:    { label: "Bangunan/Kamar", fill: "#dbeafe", stroke: "#2563eb", text: "#1e3a8a", icon: "DoorOpen",   defaultShape: "rect",     defaultSize: { w: 120, h: 90 } },
  garden:  { label: "Taman",          fill: "#dcfce7", stroke: "#16a34a", text: "#14532d", icon: "Trees",      defaultShape: "rect",     defaultSize: { w: 160, h: 120 } },
  pool:    { label: "Kolam Renang",   fill: "#cffafe", stroke: "#0891b2", text: "#155e75", icon: "Waves",      defaultShape: "rect",     defaultSize: { w: 200, h: 120 } },
  mosque:  { label: "Masjid",         fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12", icon: "Landmark",   defaultShape: "rect",     defaultSize: { w: 120, h: 120 } },
  road:    { label: "Jalan",          fill: "#e5e7eb", stroke: "#6b7280", text: "#374151", icon: "Route",      defaultShape: "rect",     defaultSize: { w: 400, h: 60 } },
  parking: { label: "Parkir",         fill: "#f5f3ff", stroke: "#7c3aed", text: "#4c1d95", icon: "CircleParking", defaultShape: "rect",  defaultSize: { w: 200, h: 120 } },
  custom:  { label: "Custom",         fill: "#f1f5f9", stroke: "#64748b", text: "#334155", icon: "Shapes",     defaultShape: "rect",     defaultSize: { w: 120, h: 120 } },
};

export const CATEGORY_ORDER: PlanCategory[] = ["room", "garden", "pool", "mosque", "road", "parking", "custom"];

export const SHAPE_META: Record<PlanShape, { label: string; icon: string }> = {
  rect:     { label: "Kotak",    icon: "Square" },
  circle:   { label: "Bulat",    icon: "Circle" },
  triangle: { label: "Segitiga", icon: "Triangle" },
  polygon:  { label: "Polygon",  icon: "Pentagon" },
};

/** A regular polygon's default vertices (fractions of the bbox), n sides. */
export function regularPolygonPoints(sides: number): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const start = -Math.PI / 2; // first vertex at top
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides;
    pts.push({ x: 0.5 + 0.5 * Math.cos(a), y: 0.5 + 0.5 * Math.sin(a) });
  }
  return pts;
}
