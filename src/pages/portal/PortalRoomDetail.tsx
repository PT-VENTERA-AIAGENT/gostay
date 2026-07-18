import { useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, MapPin, Wifi, Wind, Tv, Coffee, Bath, Mountain, Check, Loader2 } from "lucide-react";
import { format, parseISO, addDays as addDaysFn } from "date-fns";
import PageTransition from "@/components/shared/PageTransition";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import { getRoomTypeBySlug } from "@/services/roomService";
import { useAvailableRooms } from "@/hooks/useRooms";

const today = format(new Date(), "yyyy-MM-dd");

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

const policies = [
  "Check-in: 2:00 PM",
  "Check-out: 12:00 PM",
  "Free cancellation up to 48 hours before check-in",
  "No smoking",
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function diffNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  return Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

/** Shift an ISO 'yyyy-MM-dd' by n days, staying on the date-only string. */
function addDays(iso: string, n: number): string {
  return format(addDaysFn(parseISO(iso), n), "yyyy-MM-dd");
}

export default function PortalRoomDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") ?? "");
  const [guests, setGuests] = useState(Number(searchParams.get("guests") ?? 1));

  const { data: room, isLoading, error } = useQuery({
    queryKey: ["room-type", slug],
    queryFn: () => getRoomTypeBySlug(slug!),
    enabled: Boolean(slug),
  });

  const {
    data: availableRooms,
    isLoading: loadingAvail,
  } = useAvailableRooms(checkIn, checkOut, room?.id);

  const nights = diffNights(checkIn, checkOut);
  const isAvailable = availableRooms !== undefined && availableRooms.length > 0;
  const datesSelected = Boolean(checkIn && checkOut);

  // A guest who moves check-in past their check-out would otherwise be left
  // holding an impossible range and a silently dead Book button; keep the stay
  // valid by dragging check-out along with it.
  function pickCheckIn(next: string) {
    setCheckIn(next);
    if (next && checkOut && checkOut <= next) setCheckOut(addDays(next, 1));
  }

  function handleBook() {
    if (!room) return;
    navigate("/portal/book/details", {
      state: { roomType: room, checkIn, checkOut, guests },
    });
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 animate-pulse">
          <div className="h-5 bg-muted rounded w-32" />
          <div className="aspect-[16/9] bg-muted rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-8 bg-muted rounded w-2/3" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-4/5" />
            </div>
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (error || !room) {
    return (
      <PageTransition>
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 text-center space-y-4">
          <p className="text-muted-foreground">
            {!room && !error ? "Room not found." : "Failed to load room details. Please try again."}
          </p>
          <Link to="/portal" className="text-primary text-sm hover:underline">Back to rooms</Link>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">
        <Link to="/portal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to rooms
        </Link>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 rounded-xl overflow-hidden">
          <div className="col-span-2 row-span-2 aspect-[4/3] bg-muted flex items-center justify-center text-muted-foreground overflow-hidden">
            {room.photos?.[0]
              ? <img src={room.photos[0]} alt={room.name} className="w-full h-full object-cover" />
              : "No photo"}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[4/3] bg-muted items-center justify-center text-muted-foreground text-sm hidden md:flex overflow-hidden">
              {room.photos?.[i]
                ? <img src={room.photos[i]} alt={`${room.name} ${i + 1}`} className="w-full h-full object-cover" />
                : `Photo ${i}`}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{room.name}</h1>
                {datesSelected && (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                    loadingAvail
                      ? "bg-muted text-muted-foreground"
                      : isAvailable
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}>
                    {loadingAvail ? "Checking..." : isAvailable ? "Tersedia" : "Tidak Tersedia"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 md:gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Up to {room.max_occupancy} guests</span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Room</span>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">About this room</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{room.description}</p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Amenities</h2>
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(room.amenities ?? []).map((a) => {
                  const Icon = amenityIcons[a] || Check;
                  return (
                    <motion.div key={a} variants={staggerItem} className="flex items-center gap-2 text-sm text-foreground">
                      <Icon className="w-4 h-4 text-primary" /> {a}
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Policies</h2>
              <ul className="space-y-2">
                {policies.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-success" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <div className="bg-card rounded-xl border border-border p-5 sticky top-6">
              <p className="text-2xl font-bold text-primary mb-1">{formatIDR(room.base_rate)}</p>
              <p className="text-sm text-muted-foreground mb-5">per night</p>

              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in</label>
                  <DatePicker
                    value={checkIn}
                    onChange={pickCheckIn}
                    min={today}
                    placeholder="Pilih tanggal menginap"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-out</label>
                  <DatePicker
                    value={checkOut}
                    onChange={setCheckOut}
                    min={checkIn ? addDays(checkIn, 1) : today}
                    placeholder={checkIn ? "Pilih tanggal pulang" : "Pilih check-in dulu"}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Guests</label>
                  <select
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Array.from({ length: room.max_occupancy }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n} Guest{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* The button used to just go grey. Say why: checking, sold out,
                  or how little is left — all three change what a guest does next. */}
              {datesSelected && (
                <div className="mb-3 text-xs">
                  {loadingAvail ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengecek ketersediaan…
                    </span>
                  ) : isAvailable ? (
                    <span className="flex items-center gap-1.5 text-success">
                      <Check className="w-3.5 h-3.5" />
                      {availableRooms!.length} kamar tersedia untuk tanggal ini
                    </span>
                  ) : (
                    <span className="text-destructive">
                      Kamar tipe ini penuh pada tanggal tersebut. Coba geser tanggalnya.
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={handleBook}
                disabled={!datesSelected || (!loadingAvail && !isAvailable)}
                className="block w-full bg-primary text-primary-foreground py-3 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!datesSelected ? "Pilih tanggal dulu" : "Book Now"}
              </button>

              {nights > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{nights} night{nights > 1 ? "s" : ""} × {formatIDR(room.base_rate)}</span>
                    <span className="font-medium text-foreground">{formatIDR(room.base_rate * nights)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary">{formatIDR(room.base_rate * nights)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
