import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, Wifi, Wind, Tv, Coffee, Bath, Mountain } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const roomTypes = [
  { id: "1", name: "Standard Room", basePrice: 850000, maxOccupancy: 2, bedType: "Queen", sizeSqm: 28, totalRooms: 15, available: 8, amenities: ["WiFi", "AC", "TV"], status: "active" },
  { id: "2", name: "Deluxe Room", basePrice: 1250000, maxOccupancy: 3, bedType: "King", sizeSqm: 38, totalRooms: 12, available: 5, amenities: ["WiFi", "AC", "TV", "Mini Bar"], status: "active" },
  { id: "3", name: "Suite", basePrice: 2500000, maxOccupancy: 4, bedType: "King", sizeSqm: 55, totalRooms: 6, available: 2, amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"], status: "active" },
  { id: "4", name: "Family Room", basePrice: 1800000, maxOccupancy: 5, bedType: "Twin + Sofa", sizeSqm: 48, totalRooms: 8, available: 3, amenities: ["WiFi", "AC", "TV", "Mini Bar"], status: "active" },
  { id: "5", name: "Presidential Suite", basePrice: 5000000, maxOccupancy: 4, bedType: "King", sizeSqm: 90, totalRooms: 2, available: 1, amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"], status: "active" },
];

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function RoomTypes() {
  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Room Types</h1>
            <p className="text-sm text-muted-foreground mt-1">{roomTypes.length} room types configured</p>
          </div>
          <button className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press self-start">
            <Plus className="w-4 h-4" /> Add Room Type
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 w-full sm:max-w-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input placeholder="Search room types..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <button className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors btn-press">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roomTypes.map((type) => (
            <motion.div key={type.id} variants={staggerItem} whileHover={{ y: -4 }}>
              <Link
                to={`/rooms/types/${type.id}`}
                className="block bg-card rounded-xl border border-border p-4 md:p-5 hover:shadow-md transition-all group"
              >
                <div className="aspect-[16/9] bg-muted rounded-lg mb-4 flex items-center justify-center text-muted-foreground text-sm">
                  Photo placeholder
                </div>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{type.name}</h3>
                  <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{type.bedType}</span>
                </div>
                <p className="text-lg font-bold text-primary mb-1 tabular-nums">{formatIDR(type.basePrice)} <span className="text-xs font-normal text-muted-foreground">/ night</span></p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span>{type.sizeSqm} m²</span>
                  <span>·</span>
                  <span>Max {type.maxOccupancy} guests</span>
                  <span>·</span>
                  <span className={cn(type.available === 0 ? "text-destructive font-medium" : "")}>{type.available}/{type.totalRooms} available</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
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
        </motion.div>
      </div>
    </PageTransition>
  );
}
