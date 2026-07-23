import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT, tr } from "@/lib/i18n";
import { Link } from "react-router-dom";
import { Search, Plus, Settings, DoorOpen, Loader2, CalendarDays, ChevronDown, LayoutGrid, Map as MapIcon, Pencil, MapPinned } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAnimatedCounter } from "@/hooks/use-animated-counter";
import { useRooms, useRoomTypes, roomKeys } from "@/hooks/useRooms";
import { useBookingsInRange } from "@/hooks/useBookings";
import { statusForDate, type RoomStatus } from "@/lib/roomStatus";
import { setHousekeeping, type HousekeepingStatus } from "@/services/roomService";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import RoomFormDialog from "@/components/rooms/RoomFormDialog";
import FloorPlanEditor from "@/components/rooms/floorplan/FloorPlanEditor";
import FloorPlanViewer from "@/components/rooms/floorplan/FloorPlanViewer";
import { useFloorPlan } from "@/hooks/useFloorPlan";
import DatePicker from "@/components/shared/DatePicker";
import type { Room } from "@/types/database.types";

const todayISO = () => new Date().toISOString().slice(0, 10);
function nextDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const statusConfig: Record<RoomStatus, { label: string; colorClass: string; dotClass: string }> = {
  available:       { label: "Available",     colorClass: "bg-secondary text-secondary-foreground", dotClass: "bg-success" },
  occupied:        { label: "Occupied",      colorClass: "badge-info",        dotClass: "bg-info" },
  checked_in:      { label: "Checked In",    colorClass: "badge-primary",     dotClass: "bg-primary" },
  reserved:        { label: "Reserved",      colorClass: "badge-warning",     dotClass: "bg-warning" },
  out_of_service:  { label: "Out of Service",colorClass: "badge-destructive", dotClass: "bg-destructive" },
};

// Housekeeping (cleaning) status — separate from booking/availability status.
// Labels are Indonesian; each status gets a distinct colour.
const HOUSEKEEPING_ORDER: HousekeepingStatus[] = ["clean", "dirty", "cleaning", "inspected", "maintenance"];
const housekeepingConfig: Record<HousekeepingStatus, { label: string; badgeClass: string; dotClass: string }> = {
  clean:       { label: "Bersih",      badgeClass: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400", dotClass: "bg-green-500" },
  dirty:       { label: "Kotor",       badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",         dotClass: "bg-red-500" },
  cleaning:    { label: "Dibersihkan", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", dotClass: "bg-amber-500" },
  inspected:   { label: "Diperiksa",   badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",     dotClass: "bg-blue-500" },
  maintenance: { label: "Perbaikan",   badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300",     dotClass: "bg-gray-400" },
};

function HousekeepingBadge({ room }: { room: Room }) {
  const t = useT();
  const qc = useQueryClient();
  const { toast } = useToast();
  // `housekeeping_status` is migrated but not yet in the Room type — read it via cast.
  const current = ((room as unknown as { housekeeping_status?: HousekeepingStatus }).housekeeping_status
    ?? "clean") as HousekeepingStatus;

  const mutation = useMutation({
    mutationFn: (status: HousekeepingStatus) => setHousekeeping(room.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: roomKeys.list() }),
    onError: () =>
      toast({ variant: "destructive", title: tr("Gagal memperbarui housekeeping"), description: tr("Silakan coba lagi.") }),
  });

  const config = housekeepingConfig[current];

  return (
    <DropdownMenu>
      {/* stopPropagation so opening the menu doesn't also open the room edit dialog */}
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={mutation.isPending}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50",
            config.badgeClass,
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
          {t(config.label)}
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>{t("Housekeeping")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current} onValueChange={(v) => mutation.mutate(v as HousekeepingStatus)}>
          {HOUSEKEEPING_ORDER.map((status) => (
            <DropdownMenuRadioItem key={status} value={status}>
              <span className={cn("w-2 h-2 rounded-full mr-2", housekeepingConfig[status].dotClass)} />
              {t(housekeepingConfig[status].label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const animated = useAnimatedCounter(value, 800);
  return <>{animated}</>;
}

export default function Rooms() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [date, setDate] = useState(todayISO());
  // "grid" = the status board; "plan" = the top-down site plan (denah).
  const [view, setView] = useState<"grid" | "plan">("grid");
  // Within the denah: "status" (live read-only map) vs "edit" (layout editor).
  const [denahMode, setDenahMode] = useState<"status" | "edit">("status");

  const { data: rooms = [], isLoading, error } = useRooms();
  const { data: roomTypes = [] } = useRoomTypes();
  // Bookings that cover the selected night, to colour each room for THAT date.
  const { data: dayBookings = [] } = useBookingsInRange(date, nextDay(date));

  // Filter chips come from the room types staff actually configured — the old
  // hardcoded list ("Standard…Presidential") both missed new types and offered
  // ones that do not exist.
  const roomTypeFilters = useMemo(
    () => ["All", ...roomTypes.map((t) => t.name)],
    [roomTypes],
  );

  // room_id → status of the booking occupying it that night (if any).
  const bookingStatusByRoom = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of dayBookings) {
      // checked_in wins over a mere reservation if somehow both exist.
      const cur = m.get(b.room_id);
      if (!cur || b.status === "checked_in") m.set(b.room_id, b.status);
    }
    return m;
  }, [dayBookings]);

  const statusOf = (room: Room) => statusForDate(room.is_active, bookingStatusByRoom.get(room.id));

  // For the denah "status" view: room_id → live status, and room_id → occupant.
  const { data: floorPlan } = useFloorPlan();
  const statusByRoom = useMemo(() => {
    const m = new Map<string, RoomStatus>();
    for (const r of rooms) m.set(r.id, statusForDate(r.is_active, bookingStatusByRoom.get(r.id)));
    return m;
  }, [rooms, bookingStatusByRoom]);
  const occupantByRoom = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of dayBookings) {
      const name = b.customers?.full_name ?? (b as { guest_name?: string }).guest_name;
      if (name && (!m.has(b.room_id) || b.status === "checked_in")) m.set(b.room_id, name);
    }
    return m;
  }, [dayBookings]);

  function openAdd() { setEditingRoom(null); setDialogOpen(true); }
  function openEdit(room: Room) { setEditingRoom(room); setDialogOpen(true); }

  const filtered = rooms.filter((r) => {
    const status = statusOf(r);
    const typeName = r.room_types?.name ?? "";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (typeFilter !== "All" && typeName !== typeFilter) return false;
    if (search && !r.number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isToday = date === todayISO();

  const floors = [...new Set(filtered.map((r) => r.floor))].sort((a, b) => a - b);

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
        <div className="p-6 text-center text-sm text-destructive">{t("Failed to load rooms. Please try again.")}</div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("Room Status Board")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {rooms.length} total rooms · {rooms.filter((r) => statusOf(r) === "available").length} available {isToday ? "hari ini" : `pada ${new Date(date + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {/* View switcher: status board vs editable site plan */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setView("grid")}
                className={cn("flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors btn-press", view === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <LayoutGrid className="w-4 h-4" /> <span className="hidden sm:inline">{t("Grid")}</span>
              </button>
              <button
                onClick={() => setView("plan")}
                className={cn("flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors btn-press", view === "plan" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <MapIcon className="w-4 h-4" /> <span className="hidden sm:inline">{t("Denah")}</span>
                <span className="text-[9px] font-bold leading-none px-1 py-0.5 rounded bg-warning/20 text-warning uppercase tracking-wide">Beta</span>
              </button>
            </div>
            <Link to="/rooms/types" className="px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2 btn-press">
              <Settings className="w-4 h-4" /> <span className="hidden sm:inline">{t("Room Types")}</span>
            </Link>
            {view === "grid" && (
              <button onClick={openAdd} className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t("Add Room")}</span>
              </button>
            )}
          </div>
        </div>

        {view === "plan" && (
          <div className="space-y-3">
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-2.5 flex items-center gap-2 text-xs md:text-sm text-foreground">
              <span className="text-[9px] font-bold leading-none px-1.5 py-0.5 rounded bg-warning/20 text-warning uppercase tracking-wide shrink-0">Beta</span>
              <span>{t("Fitur Denah masih tahap pengembangan (early access). Fungsinya bisa berubah.")}</span>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                onClick={() => setDenahMode("status")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors btn-press", denahMode === "status" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <MapPinned className="w-4 h-4" /> {t("Status")}
              </button>
              <button
                onClick={() => setDenahMode("edit")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors btn-press", denahMode === "edit" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                <Pencil className="w-4 h-4" /> {t("Edit Denah")}
              </button>
            </div>

            {denahMode === "edit" ? (
              <FloorPlanEditor />
            ) : (
              <div className="h-[calc(100vh-16rem)] min-h-[480px]">
                <FloorPlanViewer
                  plan={floorPlan ?? undefined}
                  rooms={rooms}
                  statusByRoom={statusByRoom}
                  occupantByRoom={occupantByRoom}
                  mode="staff"
                  caption={isToday ? "Status hari ini" : `Status ${new Date(date + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`}
                  onPickRoom={(room) => openEdit(room)}
                />
              </div>
            )}
          </div>
        )}

        {view === "grid" && (<>
        {/* Date selector — the board reflects room status for this night. */}
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Status untuk tanggal:</span>
          <div className="w-44">
            <DatePicker value={date} onChange={(v) => setDate(v || todayISO())} placeholder="Pilih tanggal" />
          </div>
          {!isToday && (
            <button onClick={() => setDate(todayISO())} className="text-sm text-primary font-medium hover:underline">{t("Hari ini")}</button>
          )}
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(Object.entries(statusConfig) as [RoomStatus, typeof statusConfig[RoomStatus]][]).map(([key, config]) => {
            const count = rooms.filter((r) => statusOf(r) === key).length;
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
                  <span className="text-xs font-medium text-muted-foreground">{t(config.label)}</span>
                </div>
                <p className="text-xl md:text-2xl font-bold text-foreground tabular-nums"><AnimatedCount value={count} /></p>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Search keeps a fixed width (shrink-0) and the type chips take the rest
            and scroll. Previously the chip row had no min-w-0, so overflow-x-auto
            never engaged: it forced its full intrinsic width and crushed the
            search box down to a sliver once there were more than a few types. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 w-full sm:w-64 md:w-72 shrink-0 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search room number...")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full min-w-0" />
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-1 min-w-0 overflow-x-auto">
            {roomTypeFilters.map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)} className={cn("px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 touch-target btn-press", typeFilter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
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
                const status = statusOf(room);
                const config = statusConfig[status];
                return (
                  <motion.div
                    key={room.id}
                    variants={staggerItem}
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => openEdit(room)}
                    className="bg-card rounded-xl border border-border p-3 md:p-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base md:text-lg font-bold text-foreground">{room.number}</span>
                      <span className={cn("w-2.5 h-2.5 rounded-full", config.dotClass)} />
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{room.room_types?.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full", config.colorClass)}>{t(config.label)}</span>
                      <HousekeepingBadge room={room} />
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ))}

        {floors.length === 0 && (
          <div className="text-center py-16">
            <DoorOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">{t("No rooms match your filters")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("Try adjusting your search or filter criteria")}</p>
            <button onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("All"); }} className="text-sm text-primary font-medium hover:underline">{t("Clear filters")}</button>
          </div>
        )}
        </>)}

        <RoomFormDialog open={dialogOpen} onOpenChange={setDialogOpen} room={editingRoom} />
      </div>
    </PageTransition>
  );
}
