import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit, Trash2, Wifi, Wind, Tv, Coffee, Bath, Mountain, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

const mockType = {
  id: "1",
  name: "Deluxe Room",
  description: "Spacious deluxe room with modern amenities, a comfortable king-size bed, and stunning city views. Perfect for business travelers and couples looking for extra comfort.",
  basePrice: 1250000,
  maxAdults: 2,
  maxChildren: 1,
  sizeSqm: 38,
  bedType: "King",
  amenities: ["WiFi", "AC", "TV", "Mini Bar", "Bathtub", "Sea View"],
  rooms: [
    { number: "104", floor: 1, status: "available" },
    { number: "105", floor: 1, status: "out_of_service" },
    { number: "203", floor: 2, status: "occupied" },
    { number: "207", floor: 2, status: "available" },
    { number: "304", floor: 3, status: "available" },
  ],
  priceOverrides: [
    { label: "Peak Season 2026", startDate: "2026-06-01", endDate: "2026-08-31", pricePerNight: 1750000 },
    { label: "Holiday Season", startDate: "2026-12-20", endDate: "2027-01-05", pricePerNight: 2000000 },
  ],
};

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function RoomTypeDetail() {
  const { id } = useParams();

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Link to="/rooms/types" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 self-start btn-press">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{mockType.name}</h1>
            <p className="text-sm text-muted-foreground">Room Type #{id}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press">
              <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-destructive bg-card text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors btn-press">
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Photos</h2>
                <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Upload
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-[4/3] bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-xs">
                    Photo {i}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{mockType.description}</p>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-3">Amenities</h2>
              <div className="flex flex-wrap gap-2">
                {mockType.amenities.map((a) => {
                  const Icon = amenityIcons[a];
                  return (
                    <span key={a} className="inline-flex items-center gap-1.5 text-sm bg-secondary text-secondary-foreground px-3 py-1.5 rounded-lg">
                      {Icon && <Icon className="w-4 h-4" />} {a}
                    </span>
                  );
                })}
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">Seasonal Pricing</h2>
                <button className="text-sm text-primary font-medium hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Rule
                </button>
              </div>
              <div className="space-y-3">
                {mockType.priceOverrides.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-accent transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{o.label}</p>
                      <p className="text-xs text-muted-foreground">{o.startDate} → {o.endDate}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary tabular-nums">{formatIDR(o.pricePerNight)}/night</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>

          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Base Price</span><span className="font-semibold text-foreground tabular-nums">{formatIDR(mockType.basePrice)}/night</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bed Type</span><span className="font-medium text-foreground">{mockType.bedType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Size</span><span className="font-medium text-foreground">{mockType.sizeSqm} m²</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max Adults</span><span className="font-medium text-foreground">{mockType.maxAdults}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max Children</span><span className="font-medium text-foreground">{mockType.maxChildren}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Rooms</span><span className="font-medium text-foreground">{mockType.rooms.length}</span></div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">Rooms ({mockType.rooms.length})</h2>
              <div className="space-y-2">
                {mockType.rooms.map((r) => (
                  <div key={r.number} className="flex items-center justify-between p-2.5 bg-muted rounded-lg hover:bg-accent transition-colors">
                    <div>
                      <span className="text-sm font-medium text-foreground">Room {r.number}</span>
                      <span className="text-xs text-muted-foreground ml-2">Floor {r.floor}</span>
                    </div>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                      r.status === "available" ? "bg-secondary text-secondary-foreground" :
                      r.status === "occupied" ? "badge-info" : "badge-destructive"
                    )}>
                      {r.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
