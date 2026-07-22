import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MapPinned } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import FloorPlanViewer from "@/components/rooms/floorplan/FloorPlanViewer";
import { useFloorPlan } from "@/hooks/useFloorPlan";
import { useRooms, useAvailableRooms } from "@/hooks/useRooms";
import { useTenant } from "@/hooks/useTenant";
import type { RoomStatus } from "@/lib/roomStatus";
import type { RoomWithType } from "@/types/database.types";

export default function PortalFloorPlan() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { name: hotelName } = useTenant();

  const checkIn = params.get("checkIn") ?? "";
  const checkOut = params.get("checkOut") ?? "";
  const guests = params.get("guests") ?? "";
  const hasDates = Boolean(checkIn && checkOut && checkOut > checkIn);

  const { data: floorPlan, isLoading: loadingPlan } = useFloorPlan();
  const { data: rooms = [] } = useRooms();
  // Only real availability when both dates are set; otherwise everything is
  // browsable and the guest picks dates on the room page.
  const { data: availableRooms = [] } = useAvailableRooms(
    hasDates ? checkIn : "",
    hasDates ? checkOut : "",
  );

  const statusByRoom = useMemo(() => {
    const m = new Map<string, RoomStatus>();
    if (hasDates) {
      const free = new Set(availableRooms.map((r) => r.id));
      for (const r of rooms) m.set(r.id, r.is_active ? (free.has(r.id) ? "available" : "reserved") : "out_of_service");
    } else {
      for (const r of rooms) m.set(r.id, r.is_active ? "available" : "out_of_service");
    }
    return m;
  }, [rooms, availableRooms, hasDates]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  function pickRoom(room: RoomWithType) {
    const slug = room.room_types?.slug;
    if (!slug) return;
    const q = hasDates ? `?checkIn=${checkIn}&checkOut=${checkOut}${guests ? `&guests=${guests}` : ""}` : "";
    navigate(`/portal/rooms/${slug}${q}`);
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Denah {hotelName}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Lihat tata letak properti dan pilih lokasi kamar. Ketuk sebuah bangunan untuk melihat detail dan memesan.
          </p>
        </div>

        {/* Optional date filter — colours the map by availability for those nights. */}
        <div className="flex flex-wrap items-end gap-3 bg-card border border-border rounded-xl p-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in</label>
            <div className="w-40"><DatePicker value={checkIn} onChange={(v) => setParam("checkIn", v || "")} placeholder="Pilih tanggal" /></div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-out</label>
            <div className="w-40"><DatePicker value={checkOut} onChange={(v) => setParam("checkOut", v || "")} placeholder="Pilih tanggal" /></div>
          </div>
          {hasDates && (
            <p className="text-xs text-muted-foreground pb-2">Warna hijau = tersedia untuk tanggal ini.</p>
          )}
        </div>

        <div className="h-[calc(100vh-20rem)] min-h-[440px]">
          {loadingPlan ? (
            <div className="w-full h-full rounded-xl border border-border flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <FloorPlanViewer
              plan={floorPlan ?? undefined}
              rooms={rooms}
              statusByRoom={statusByRoom}
              mode="guest"
              onPickRoom={pickRoom}
              caption={hasDates ? "Ketersediaan untuk tanggal terpilih" : "Pilih tanggal untuk melihat ketersediaan"}
            />
          )}
        </div>
      </div>
    </PageTransition>
  );
}
