import { useState } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Search, Plus, Settings, DoorOpen } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";

type RoomStatus = "available" | "occupied" | "checked_in" | "out_of_service" | "reserved";

const rooms: { id: string; number: string; floor: number; type: string; status: RoomStatus; guest?: string; checkOut?: string }[] = [
  { id: "1", number: "101", floor: 1, type: "Standard", status: "available" },
  { id: "2", number: "102", floor: 1, type: "Standard", status: "occupied", guest: "David Chen", checkOut: "Apr 4" },
  { id: "3", number: "103", floor: 1, type: "Standard", status: "checked_in", guest: "Sarah Kim", checkOut: "Apr 5" },
  { id: "4", number: "104", floor: 1, type: "Deluxe", status: "available" },
  { id: "5", number: "105", floor: 1, type: "Deluxe", status: "out_of_service" },
  { id: "6", number: "106", floor: 1, type: "Standard", status: "available" },
  { id: "7", number: "107", floor: 1, type: "Deluxe", status: "checked_in", guest: "Lisa Wang", checkOut: "Apr 4" },
  { id: "8", number: "201", floor: 2, type: "Standard", status: "available" },
  { id: "9", number: "202", floor: 2, type: "Standard", status: "reserved", guest: "Mike Johnson" },
  { id: "10", number: "203", floor: 2, type: "Deluxe", status: "occupied", guest: "Emily Davis", checkOut: "Apr 6" },
  { id: "11", number: "204", floor: 2, type: "Suite", status: "available" },
  { id: "12", number: "205", floor: 2, type: "Suite", status: "checked_in", guest: "Robert Wilson", checkOut: "Apr 3" },
  { id: "13", number: "206", floor: 2, type: "Standard", status: "available" },
  { id: "14", number: "207", floor: 2, type: "Deluxe", status: "available" },
  { id: "15", number: "301", floor: 3, type: "Family", status: "available" },
  { id: "16", number: "302", floor: 3, type: "Family", status: "occupied", guest: "Anna Lee", checkOut: "Apr 2" },
  { id: "17", number: "303", floor: 3, type: "Suite", status: "available" },
  { id: "18", number: "304", floor: 3, type: "Presidential", status: "available" },
  { id: "19", number: "305", floor: 3, type: "Presidential", status: "reserved", guest: "James Brown" },
  { id: "20", number: "306", floor: 3, type: "Family", status: "out_of_service" },
];

const statusConfig: Record<RoomStatus, { label: string; colorClass: string; dotClass: string }> = {
  available: { label: "Available", colorClass: "bg-secondary text-secondary-foreground", dotClass: "bg-success" },
  occupied: { label: "Occupied", colorClass: "badge-info", dotClass: "bg-info" },
  checked_in: { label: "Checked In", colorClass: "badge-primary", dotClass: "bg-primary" },
  reserved: { label: "Reserved", colorClass: "badge-warning", dotClass: "bg-warning" },
  out_of_service: { label: "Out of Service", colorClass: "badge-destructive", dotClass: "bg-destructive" },
};

const roomTypes = ["All", "Standard", "Deluxe", "Suite", "Family", "Presidential"];

function AnimatedCount({ value }: { value: number }) {
  const animated = useAnimatedCounter(value, 800);
  return <>{animated}</>;
}

export default function Rooms() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState("All");

  const filtered = rooms.filter((r) => {
    if (search && !r.number.includes(search) && !r.guest?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (typeFilter !== "All" && r.type !== typeFilter) return false;
    return true;
  });

  const floors = [...new Set(filtered.map((r) => r.floor))].sort();

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Room Status Board</h1>
            <p className="text-sm text-muted-foreground mt-1">{rooms.length} total rooms · {rooms.filter((r) => r.status === "available").length} available</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link to="/rooms/types" className="px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2 btn-press">
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline">Room Types</span>
            </Link>
            <button className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Room</span>
            </button>
          </div>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(Object.entries(statusConfig) as [RoomStatus, typeof statusConfig[RoomStatus]][]).map(([key, config]) => {
            const count = rooms.filter((r) => r.status === key).length;
            const isActive = statusFilter === key;
            return (
              <motion.button
                key={key}
                variants={staggerItem}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setStatusFilter(isActive ? "all" : key)}
                className={cn("bg-card rounded-xl border p-3 md:p-4 text-left transition-all card-hover", isActive ? "border-primary ring-1 ring-primary/30" : "border-border")}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn("w-2.5 h-2.5 rounded-full", config.dotClass)} />
                  <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-foreground tabular-nums"><AnimatedCount value={count} /></p>
              </motion.button>
            );
          })}
        </motion.div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 w-full sm:max-w-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search room or guest..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
            {roomTypes.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)} className={cn("px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap touch-target btn-press", typeFilter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {floors.map((floor) => (
          <div key={floor}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Floor {floor}</h3>
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.filter((r) => r.floor === floor).map((room) => {
                const config = statusConfig[room.status];
                return (
                  <motion.div
                    key={room.id}
                    variants={staggerItem}
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="bg-card rounded-xl border border-border p-3 md:p-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base md:text-lg font-bold text-foreground">{room.number}</span>
                      <span className={cn("w-2.5 h-2.5 rounded-full", config.dotClass)} />
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{room.type}</p>
                    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full", config.colorClass)}>{config.label}</span>
                    {room.guest && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs font-medium text-foreground truncate">{room.guest}</p>
                        {room.checkOut && <p className="text-xs text-muted-foreground">Out: {room.checkOut}</p>}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ))}
        {floors.length === 0 && (
          <div className="text-center py-16">
            <DoorOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No rooms match your filters</p>
            <p className="text-xs text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
            <button onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("All"); }} className="text-sm text-primary font-medium hover:underline">Clear filters</button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
