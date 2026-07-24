import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, User, Calendar, MapPin, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useT, tr } from "@/lib/i18n";
import { useMemo, useState } from "react";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import { useRoomTypes, useAvailableRooms } from "@/hooks/useRooms";
import { useSearchCustomers } from "@/hooks/useBookings";
import { getOrCreateCustomer, createBooking } from "@/services/bookingService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { BookingSource, Customer } from "@/types/database.types";

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

export default function NewBooking() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [guestQuery, setGuestQuery] = useState("");
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);

  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [source, setSource] = useState<BookingSource>("walk_in");
  const [specialRequests, setSpecialRequests] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roomTypes } = useRoomTypes();
  const { data: searchResults, isFetching: searching } = useSearchCustomers(guestQuery);
  // Only asks once there is a date range — an availability query without one
  // would be answering a question nobody asked.
  const { data: availableRooms, isFetching: loadingRooms } = useAvailableRooms(checkIn, checkOut, roomTypeId || undefined);

  const nights = nightsBetween(checkIn, checkOut);
  const selectedType = roomTypes?.find((t) => t.id === roomTypeId);
  const rate = selectedType ? Number(selectedType.base_rate) : 0;
  const total = rate * nights;

  const datesValid = Boolean(checkIn && checkOut) && nights > 0;
  const canSubmit = Boolean(fullName.trim() && email.trim() && datesValid && roomTypeId && (availableRooms?.length ?? 0) > 0) && !submitting;

  const roomsForType = useMemo(() => availableRooms ?? [], [availableRooms]);

  function pickCustomer(c: Customer) {
    setLinkedCustomer(c);
    setFullName(c.full_name);
    setEmail(c.email);
    setPhone(c.phone ?? "");
    setNationality(c.nationality ?? "");
    setGuestQuery("");
  }

  function clearCustomer() {
    setLinkedCustomer(null);
    setFullName(""); setEmail(""); setPhone(""); setNationality("");
  }

  async function handleCreate() {
    setError(null);
    if (!datesValid) { setError("Check-out must be after check-in."); return; }

    // Auto-assign takes the first free room of the type, same rule the portal
    // uses. Re-read here rather than trusting the list in state: it was fetched
    // when the dates changed and another agent may have taken the room since.
    const room = roomId ? roomsForType.find((r) => r.id === roomId) : roomsForType[0];
    if (!room) { setError("No rooms of that type are free for these dates."); return; }

    setSubmitting(true);
    try {
      // Staff-side lookup by email: staff can see every customer row, so this
      // reuses an existing guest instead of creating a duplicate.
      const customer = linkedCustomer ?? await getOrCreateCustomer({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        nationality: nationality.trim() || null,
        profile_id: null,
      });

      const booking = await createBooking({
        customer_id: customer.id,
        room_id: room.id,
        check_in: checkIn,
        check_out: checkOut,
        num_adults: adults,
        num_children: children,
        // Staff take the booking in person or on the phone, so unlike the
        // portal it is confirmed on the spot — 005_tighten_rls.sql pins only
        // customer-created rows to 'pending'.
        status: "confirmed",
        total_amount: total,
        amount_paid: 0,
        payment_status: "pending",
        source,
        special_requests: specialRequests.trim() || null,
        internal_notes: internalNotes.trim() || null,
        created_by: user?.id ?? null,
      });

      toast({ title: tr("Booking created"), description: `${booking.reference} for ${customer.full_name}.` });
      navigate(`/bookings/${booking.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the booking.");
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/bookings" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("New Booking")}</h1>
            <p className="text-sm text-muted-foreground">{t("Create a reservation for a walk-in or phone guest")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Guest Information</h2>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                <div className="relative flex-1 w-full">
                  <div className="search-focus flex items-center gap-2 bg-background border border-input rounded-lg px-4 py-2.5">
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      value={guestQuery}
                      onChange={(e) => setGuestQuery(e.target.value)}
                      placeholder="Search existing guest by name, email or phone..."
                      className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
                    />
                    {searching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                  </div>
                  {guestQuery.length >= 2 && (searchResults?.length ?? 0) > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {searchResults!.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => pickCustomer(c)}
                          className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
                        >
                          <p className="text-sm font-medium text-foreground">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {linkedCustomer && (
                  <button onClick={clearCustomer} className="text-sm text-primary font-medium hover:underline whitespace-nowrap">
                    New Guest
                  </button>
                )}
              </div>

              {linkedCustomer && (
                <p className="text-xs text-muted-foreground mb-3">
                  Linked to existing guest <span className="font-medium text-foreground">{linkedCustomer.full_name}</span> — their record will be reused.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Full Name")}</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={Boolean(linkedCustomer)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/50 disabled:text-muted-foreground" placeholder="Guest name" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Email")}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(linkedCustomer)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/50 disabled:text-muted-foreground" placeholder="guest@email.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Phone")}</label>
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+62..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Nationality")}</label>
                  <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Indonesia" />
                </div>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Stay Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Check-in Date")}</label>
                  <DatePicker value={checkIn} onChange={setCheckIn} placeholder="Pilih check-in" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Check-out Date")}</label>
                  <DatePicker value={checkOut} onChange={setCheckOut} min={checkIn || undefined} placeholder="Pilih check-out" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Adults")}</label>
                  <input type="number" value={adults} min={1} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">{t("Children")}</label>
                  <input type="number" value={children} min={0} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              {checkIn && checkOut && nights === 0 && (
                <p className="text-xs text-destructive mt-2">{t("Check-out must be after check-in.")}</p>
              )}
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Room Selection</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Room Type</label>
                  <select value={roomTypeId} onChange={(e) => { setRoomTypeId(e.target.value); setRoomId(""); }}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Select room type...</option>
                    {roomTypes?.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} — {formatIDR(Number(t.base_rate))}/night</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Specific Room</label>
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)} disabled={!datesValid || !roomTypeId}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/50 disabled:text-muted-foreground">
                    <option value="">{t("Auto-assign")}</option>
                    {roomsForType.map((r) => (
                      <option key={r.id} value={r.id}>Room {r.number} (floor {r.floor})</option>
                    ))}
                  </select>
                  {datesValid && roomTypeId && !loadingRooms && (
                    <p className={`text-xs mt-1.5 ${roomsForType.length === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {roomsForType.length === 0
                        ? "No rooms of this type are free for these dates."
                        : `${roomsForType.length} room${roomsForType.length !== 1 ? "s" : ""} free`}
                    </p>
                  )}
                  {!datesValid && <p className="text-xs text-muted-foreground mt-1.5">{t("Pick dates to see what is free.")}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Source</label>
                  <select value={source} onChange={(e) => setSource(e.target.value as BookingSource)}
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="walk_in">Walk-in</option>
                    <option value="phone">{t("Phone")}</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Special Requests</label>
                <textarea rows={3} value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Any special requests..." />
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
              <h2 className="font-semibold text-foreground mb-4">{t("Internal Notes")}</h2>
              <textarea rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Staff-only notes..." />
            </motion.div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}>
            <div className="bg-card rounded-xl border border-border p-4 md:p-5 sticky top-6">
              <h2 className="font-semibold text-foreground mb-4">{t("Price Summary")}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Room type</span><span className="text-foreground">{selectedType?.name ?? "—"}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>{t("Dates")}</span><span className="text-foreground">{datesValid ? `${checkIn} → ${checkOut}` : "—"}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>{t("Nights")}</span><span className="text-foreground">{nights || "—"}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>{t("Rate / night")}</span><span className="text-foreground">{rate ? formatIDR(rate) : "—"}</span></div>
                <div className="border-t border-border pt-3 flex justify-between font-semibold text-foreground">
                  <span>Total</span><span className="tabular-nums">{total ? formatIDR(total) : "—"}</span>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive mt-4">{error}</div>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleCreate}
                disabled={!canSubmit}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity mt-6 touch-target btn-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : "Create Booking"}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
