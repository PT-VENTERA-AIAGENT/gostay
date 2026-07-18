import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Wifi, Wind, Tv, Coffee, Bath, Mountain, Loader2, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useRoomTypes } from "@/hooks/useRooms";
import RoomTypeFormDialog from "@/components/rooms/RoomTypeFormDialog";
import type { RoomType } from "@/types/database.types";

const amenityIcons: Record<string, React.ElementType> = {
  WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain,
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function RoomTypes() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoomType | null>(null);
  const { data: roomTypes = [], isLoading, error } = useRoomTypes();

  function openAdd() { setEditing(null); setDialogOpen(true); }
  function openEdit(e: React.MouseEvent, type: RoomType) {
    e.preventDefault(); // the card is a Link to the detail page; edit shouldn't navigate
    setEditing(type);
    setDialogOpen(true);
  }

  const filtered = roomTypes.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="p-6 text-center text-sm text-destructive">Failed to load room types.</div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Room Types</h1>
            <p className="text-sm text-muted-foreground mt-1">{roomTypes.length} room types configured</p>
          </div>
          <button onClick={openAdd} className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press self-start">
            <Plus className="w-4 h-4" /> Add Room Type
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 w-full sm:max-w-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room types..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <button className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors btn-press">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((type) => (
            <motion.div key={type.id} variants={staggerItem} whileHover={{ y: -4 }} className="h-full">
              {/* h-full + flex column so every card in a row is the same height
                  (grid stretches the cell; the link has to fill it), and the
                  amenity row is pushed to the bottom with mt-auto so cards line
                  up even when one type has more amenities than another. */}
              <Link
                to={`/rooms/types/${type.id}`}
                className="flex flex-col h-full bg-card rounded-xl border border-border p-4 md:p-5 hover:shadow-md transition-all group"
              >
                <div className="aspect-[16/9] bg-muted rounded-lg mb-4 overflow-hidden shrink-0">
                  {type.photos[0] ? (
                    <img src={type.photos[0]} alt={type.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No photo</div>
                  )}
                </div>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{type.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!type.is_active && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Nonaktif</span>}
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">Max {type.max_occupancy}</span>
                    <button
                      onClick={(e) => openEdit(e, type)}
                      aria-label={`Edit ${type.name}`}
                      className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-lg font-bold text-primary mb-1 tabular-nums">
                  {formatIDR(type.base_rate)} <span className="text-xs font-normal text-muted-foreground">/ night</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                  {type.amenities.slice(0, 4).map((a) => {
                    const Icon = amenityIcons[a];
                    return (
                      <span key={a} className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">
                        {Icon && <Icon className="w-3 h-3" />} {a}
                      </span>
                    );
                  })}
                  {type.amenities.length > 4 && (
                    <span className="text-xs text-muted-foreground px-2 py-1">+{type.amenities.length - 4} more</span>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-sm text-muted-foreground">No room types found.</div>
          )}
        </motion.div>

        <RoomTypeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} roomType={editing} />
      </div>
    </PageTransition>
  );
}
