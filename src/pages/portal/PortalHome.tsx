import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Star, Wifi, Wind, Tv, Coffee, Bath, Mountain, Users, MapPin, ArrowRight, Shield, Clock, CreditCard, Phone } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem, fadeInUp } from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import { useRoomTypes, useAvailableRooms, useRooms } from "@/hooks/useRooms";
import { usePublishedReviews, useReviewStats } from "@/hooks/useReviews";
import { useTenant } from "@/hooks/useTenant";

const amenityIcons: Record<string, React.ElementType> = { WiFi: Wifi, AC: Wind, TV: Tv, "Mini Bar": Coffee, Bathtub: Bath, "Sea View": Mountain };

function formatReviewDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function RoomCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="aspect-[16/9] bg-muted" />
      <div className="p-4 md:p-5 space-y-3">
        <div className="h-5 bg-muted rounded w-2/3" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-4/5" />
        <div className="flex gap-2">
          <div className="h-6 bg-muted rounded w-16" />
          <div className="h-6 bg-muted rounded w-16" />
          <div className="h-6 bg-muted rounded w-16" />
        </div>
        <div className="pt-3 border-t border-border flex justify-between">
          <div className="h-5 bg-muted rounded w-28" />
          <div className="h-5 bg-muted rounded w-20" />
        </div>
      </div>
    </div>
  );
}

const todayISO = new Date().toISOString().slice(0, 10);

export default function PortalHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { name: hotelName } = useTenant();

  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") ?? "");
  const [guests, setGuests] = useState(searchParams.get("guests") ?? "1");
  const [searched, setSearched] = useState(Boolean(searchParams.get("checkIn")));

  const { data: roomTypes, isLoading: loadingTypes, error: errorTypes } = useRoomTypes();
  const { data: allRooms = [] } = useRooms();
  const { data: reviews = [] } = usePublishedReviews(6);
  const { data: reviewStats } = useReviewStats();
  const {
    data: availableRooms,
    isLoading: loadingAvail,
    error: errorAvail,
  } = useAvailableRooms(
    searched ? checkIn : "",
    searched ? checkOut : ""
  );

  // Derive a set of room_type_ids that have at least one available room
  const availableTypeIds = searched && availableRooms
    ? new Set(availableRooms.map((r) => r.room_type_id))
    : null;

  // Filter room types by availability when searched
  const displayedRooms = searched && availableTypeIds
    ? (roomTypes ?? []).filter((rt) => availableTypeIds.has(rt.id))
    : (roomTypes ?? []);

  function handleSearch() {
    if (!checkIn || !checkOut) return;
    setSearched(true);
    setSearchParams({ checkIn, checkOut, guests });
  }

  const isLoading = loadingTypes || (searched && loadingAvail);
  const hasError = errorTypes || (searched && errorAvail);

  return (
    <PageTransition>
      <div>
        {/* Hero */}
        <section className="relative bg-primary/5 px-4 md:px-8 py-12 md:py-20">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="max-w-4xl mx-auto text-center">
            <motion.div variants={staggerItem} className="inline-flex items-center gap-2 bg-card border border-border rounded-full px-4 py-1.5 text-sm text-muted-foreground mb-4 md:mb-6">
              <Star className="w-4 h-4 text-warning fill-warning" />
              <span>
                {reviewStats && reviewStats.count > 0
                  ? `Rated ${reviewStats.average.toFixed(1)}/5 by ${reviewStats.count} guest${reviewStats.count !== 1 ? "s" : ""}`
                  : "Direct booking, best rates"}
              </span>
            </motion.div>
            <motion.h1 variants={staggerItem} className="text-3xl md:text-5xl font-bold text-foreground mb-3 md:mb-4 leading-tight">Find Your Perfect<br />Stay at {hotelName}</motion.h1>
            <motion.p variants={staggerItem} className="text-base md:text-lg text-muted-foreground mb-6 md:mb-10 max-w-2xl mx-auto">Discover comfort and luxury in the heart of the city. Book directly for the best rates and exclusive perks.</motion.p>

            <motion.div variants={staggerItem} className="bg-card rounded-2xl border border-border p-4 md:p-6 shadow-sm max-w-3xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Check-in</label>
                  <DatePicker
                    value={checkIn}
                    min={todayISO}
                    placeholder="Pilih tanggal"
                    onChange={(v) => {
                      setCheckIn(v);
                      // Keep the range coherent: if check-out is now on or before
                      // the new check-in, clear it rather than leave an invalid span.
                      if (checkOut && v && checkOut <= v) setCheckOut("");
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Check-out</label>
                  <DatePicker
                    value={checkOut}
                    min={checkIn || todayISO}
                    placeholder="Pilih tanggal"
                    onChange={setCheckOut}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block text-left">Guests</label>
                  <select
                    value={guests}
                    onChange={(e) => setGuests(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="1">1 Guest</option>
                    <option value="2">2 Guests</option>
                    <option value="3">3 Guests</option>
                    <option value="4">4 Guests</option>
                    <option value="5">5+ Guests</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSearch}
                    className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Search className="w-4 h-4" /> Search
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Why Book Direct */}
        <section className="px-4 md:px-8 py-8 md:py-12 max-w-6xl mx-auto">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { icon: CreditCard, title: "Best Price Guarantee", desc: "Book direct and get the lowest rate guaranteed" },
              { icon: Shield, title: "Free Cancellation", desc: "Cancel up to 48 hours before check-in" },
              { icon: Clock, title: "Instant Confirmation", desc: "Get your booking confirmed immediately" },
              { icon: Phone, title: "24/7 Support", desc: "Our team is always here to help you" },
            ].map((item) => (
              <motion.div key={item.title} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }} className="text-center p-4 rounded-xl hover:bg-card hover:shadow-sm transition-all cursor-default">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3"><item.icon className="w-6 h-6 text-primary" /></div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Featured / Available Rooms */}
        <section className="px-4 md:px-8 py-8 md:py-12 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {searched ? "Available Rooms" : "Our Rooms"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {searched
                  ? `Rooms available for your selected dates`
                  : "Choose from our carefully designed room types"}
              </p>
            </div>
          </div>

          {hasError ? (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center text-sm text-destructive">
              Failed to load rooms. Please try again later.
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {[1, 2, 3].map((i) => <RoomCardSkeleton key={i} />)}
            </div>
          ) : searched && displayedRooms.length === 0 ? (
            <div className="bg-muted rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">No rooms available for the selected dates. Try different dates.</p>
            </div>
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {displayedRooms.map((room) => (
                <motion.div key={room.slug} variants={staggerItem} whileHover={{ y: -6, transition: { duration: 0.2 } }} className="h-full">
                  {/* h-full + flex column keeps every card in a row the same
                      height regardless of description length or amenity count. */}
                  <Link
                    to={`/portal/rooms/${room.slug}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}` : ""}`}
                    className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow group"
                  >
                    <div className="aspect-[16/9] bg-muted flex items-center justify-center text-muted-foreground text-sm relative overflow-hidden shrink-0">
                      {room.photos?.[0] ? (
                        <img src={room.photos[0]} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        "No photo"
                      )}
                    </div>
                    <div className="p-4 md:p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">{room.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{room.description}</p>
                      <div className="flex items-center gap-2 md:gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Up to {room.max_occupancy}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(room.amenities ?? []).slice(0, 3).map((a) => {
                          const Icon = amenityIcons[a];
                          return (
                            <span key={a} className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                              {Icon && <Icon className="w-3 h-3" />} {a}
                            </span>
                          );
                        })}
                        {(room.amenities ?? []).length > 3 && (
                          <span className="text-xs text-muted-foreground px-1">+{room.amenities.length - 3}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-3 mt-auto border-t border-border">
                        <p className="text-base md:text-lg font-bold text-primary">
                          {formatIDR(room.base_rate)} <span className="text-xs font-normal text-muted-foreground">/ night</span>
                        </p>
                        <span className="text-sm text-primary font-medium flex items-center gap-1">Book Now <ArrowRight className="w-4 h-4" /></span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>

        {/* Reviews */}
        <section className="px-4 md:px-8 py-8 md:py-12 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-6 md:mb-8"><h2 className="text-xl md:text-2xl font-bold text-foreground">What Our Guests Say</h2><p className="text-sm text-muted-foreground mt-1">Real reviews from real guests</p></div>
            {reviews.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">Belum ada ulasan. Jadilah yang pertama setelah menginap!</p>
            ) : (
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                {reviews.map((r) => (
                  <motion.div key={r.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-5">
                    <div className="flex items-center gap-1 mb-3">{Array.from({ length: r.rating }).map((_, j) => <Star key={j} className="w-4 h-4 text-warning fill-warning" />)}</div>
                    {r.comment && <p className="text-sm text-foreground mb-3 leading-relaxed">"{r.comment}"</p>}
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground">{r.customers?.full_name ?? "Tamu"}</span><span className="text-xs text-muted-foreground">{formatReviewDate(r.created_at)}</span></div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </section>

        {/* Hotel Info */}
        <section className="px-4 md:px-8 py-12 md:py-16 bg-card border-t border-border">
          <motion.div variants={fadeInUp} initial="hidden" animate="show" className="max-w-4xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl font-bold text-foreground mb-3">About {hotelName}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8 text-sm md:text-base">Located in the heart of the city, {hotelName} offers world-class hospitality with modern amenities.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-2xl mx-auto">
              {[
                { value: String(allRooms.length || 0), label: "Rooms" },
                { value: reviewStats && reviewStats.count > 0 ? reviewStats.average.toFixed(1) : "—", label: "Rating" },
                { value: String(reviewStats?.count ?? 0), label: "Reviews" },
                { value: String(roomTypes?.length ?? 0), label: "Room Types" },
              ].map((s) => (
                <div key={s.label}><p className="text-2xl md:text-3xl font-bold text-primary">{s.value}</p><p className="text-sm text-muted-foreground">{s.label}</p></div>
              ))}
            </div>
          </motion.div>
        </section>
      </div>
    </PageTransition>
  );
}
