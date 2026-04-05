import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Search, Filter, Plus } from "lucide-react";

type RoomStatus = "available" | "occupied" | "checked_in" | "out_of_service" | "reserved";

const rooms: { id: string; number: string; floor: number; type: string; status: RoomStatus; guest?: string }[] = [
  { id: "1", number: "101", floor: 1, type: "Standard", status: "available" },
  { id: "2", number: "102", floor: 1, type: "Standard", status: "occupied", guest: "David Chen" },
  { id: "3", number: "103", floor: 1, type: "Standard", status: "checked_in", guest: "Sarah Kim" },
  { id: "4", number: "104", floor: 1, type: "Deluxe", status: "available" },
  { id: "5", number: "105", floor: 1, type: "Deluxe", status: "out_of_service" },
  { id: "6", number: "201", floor: 2, type: "Standard", status: "available" },
  { id: "7", number: "202", floor: 2, type: "Standard", status: "reserved", guest: "Mike Johnson" },
  { id: "8", number: "203", floor: 2, type: "Deluxe", status: "occupied", guest: "Emily Davis" },
  { id: "9", number: "204", floor: 2, type: "Suite", status: "available" },
  { id: "10", number: "205", floor: 2, type: "Suite", status: "checked_in", guest: "Robert Wilson" },
  { id: "11", number: "301", floor: 3, type: "Family", status: "available" },
  { id: "12", number: "302", floor: 3, type: "Family", status: "occupied", guest: "Anna Lee" },
  { id: "13", number: "303", floor: 3, type: "Suite", status: "available" },
  { id: "14", number: "304", floor: 3, type: "Presidential", status: "available" },
  { id: "15", number: "305", floor: 3, type: "Presidential", status: "reserved", guest: "James Brown" },
  { id: "16", number: "106", floor: 1, type: "Standard", status: "available" },
  { id: "17", number: "107", floor: 1, type: "Deluxe", status: "checked_in", guest: "Lisa Wang" },
  { id: "18", number: "206", floor: 2, type: "Standard", status: "available" },
  { id: "19", number: "207", floor: 2, type: "Deluxe", status: "available" },
  { id: "20", number: "306", floor: 3, type: "Family", status: "out_of_service" },
];

const statusConfig: Record<RoomStatus, { label: string; colorClass: string; dotClass: string }> = {
  available: { label: "Available", colorClass: "bg-secondary text-secondary-foreground", dotClass: "bg-success" },
  occupied: { label: "Occupied", colorClass: "bg-info/10 text-info", dotClass: "bg-info" },
  checked_in: { label: "Checked In", colorClass: "bg-primary/10 text-primary", dotClass: "bg-primary" },
  reserved: { label: "Reserved", colorClass: "bg-warning/10 text-warning", dotClass: "bg-warning" },
  out_of_service: { label: "Out of Service", colorClass: "bg-destructive/10 text-destructive", dotClass: "bg-destructive" },
};

const floors = [...new Set(rooms.map((r) => r.floor))].sort();

export default function Rooms() {
  const stats = {
    available: rooms.filter((r) => r.status === "available").length,
    occupied: rooms.filter((r) => r.status === "occupied").length,
    checkedIn: rooms.filter((r) => r.status === "checked_in").length,
    outOfService: rooms.filter((r) => r.status === "out_of_service").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Room Status Board</h1>
          <p className="text-sm text-muted-foreground mt-1">{rooms.length} total rooms</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/rooms/types" className="px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
            Room Types
          </Link>
          <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Room
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-4">
        {Object.entries(statusConfig).map(([key, config]) => {
          const count = rooms.filter((r) => r.status === key).length;
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className={cn("w-2.5 h-2.5 rounded-full", config.dotClass)} />
              <span className="text-muted-foreground">{config.label}: <span className="font-semibold text-foreground">{count}</span></span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2.5 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input placeholder="Search room number..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      {/* Room grid by floor */}
      {floors.map((floor) => (
        <div key={floor}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Floor {floor}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {rooms
              .filter((r) => r.floor === floor)
              .map((room) => {
                const config = statusConfig[room.status];
                return (
                  <div
                    key={room.id}
                    className={cn(
                      "bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-foreground">{room.number}</span>
                      <span className={cn("w-2.5 h-2.5 rounded-full", config.dotClass)} />
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{room.type}</p>
                    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full", config.colorClass)}>
                      {config.label}
                    </span>
                    {room.guest && (
                      <p className="text-xs text-foreground mt-2 truncate">{room.guest}</p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
