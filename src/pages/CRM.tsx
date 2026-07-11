import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users, Phone, Mail, Calendar, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { Customer, Booking, BookingStatus } from "@/types/database.types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRow extends Booking {
  room_type: { name: string } | null;
}

interface CustomerWithBookings extends Customer {
  bookings: BookingRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const statusConfig: Record<BookingStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-warning/10 text-warning border-warning/20" },
  confirmed: { label: "Confirmed", cls: "bg-info/10 text-info border-info/20" },
  checked_in: { label: "Checked In", cls: "bg-success/10 text-success border-success/20" },
  checked_out: { label: "Checked Out", cls: "bg-secondary text-secondary-foreground border-transparent" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  no_show: { label: "No Show", cls: "bg-muted text-muted-foreground border-transparent" },
};

function isVIP(customer: CustomerWithBookings) {
  return customer.bookings.length >= 3;
}

function isNew(customer: CustomerWithBookings) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const firstBooking = customer.bookings.at(-1); // sorted desc, so last = oldest
  if (!firstBooking) return false;
  return new Date(firstBooking.created_at) >= thirtyDaysAgo;
}

function getTotalSpend(customer: CustomerWithBookings) {
  return customer.bookings.reduce((sum, b) => sum + b.total_amount, 0);
}

function getLastStay(customer: CustomerWithBookings): string | null {
  const completed = customer.bookings.filter(
    (b) => b.status === "checked_out" || b.status === "checked_in"
  );
  if (completed.length === 0) return null;
  return completed[0].check_out; // bookings ordered desc
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchCustomers(): Promise<CustomerWithBookings[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(
      `*, bookings(id, status, check_in, check_out, total_amount, created_at, room_id, customer_id, reference, reference, num_adults, num_children, amount_paid, payment_status, source, special_requests, internal_notes, created_by, updated_at, room_type:room_types(name))`
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CustomerWithBookings[];
}

// ─── Guest Detail Panel ───────────────────────────────────────────────────────

function GuestPanel({
  customer,
  open,
  onClose,
}: {
  customer: CustomerWithBookings | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!customer) return null;

  const totalSpend = getTotalSpend(customer);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
                {getInitials(customer.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{customer.full_name}</SheetTitle>
              <SheetDescription>{customer.email}</SheetDescription>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-1">
            {isVIP(customer) && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-300/30 border">VIP</Badge>
            )}
            {isNew(customer) && (
              <Badge className="bg-success/10 text-success border-success/20 border">New</Badge>
            )}
          </div>
        </SheetHeader>

        {/* Profile info */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-foreground">Guest Profile</h3>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4 shrink-0" />
                <span>{customer.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0" />
              <span>{customer.email}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Member since {formatDate(customer.created_at)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-foreground">{customer.bookings.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Bookings</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-sm font-bold text-foreground">{formatCurrency(totalSpend)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total Spend</p>
            </div>
          </div>
        </div>

        {/* Booking history */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-foreground">Booking History</h3>
          {customer.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <div className="space-y-2">
              {customer.bookings.map((booking) => {
                const sc = statusConfig[booking.status];
                return (
                  <div key={booking.id} className="bg-card border border-border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {booking.room_type?.name ?? "Room"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(booking.check_in)} — {formatDate(booking.check_out)}
                        </p>
                      </div>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border shrink-0", sc.cls)}>
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {formatCurrency(booking.total_amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick action */}
        <Link
          to={`/bookings/new?customer=${customer.id}`}
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> New Booking
        </Link>
      </SheetContent>
    </Sheet>
  );
}

// ─── CRM Page ─────────────────────────────────────────────────────────────────

export default function CRM() {
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithBookings | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: customers = [], isLoading, error } = useQuery<CustomerWithBookings[]>({
    queryKey: ["crm-customers"],
    queryFn: fetchCustomers,
    staleTime: 60_000,
  });

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q)
    );
  });

  const openPanel = (customer: CustomerWithBookings) => {
    setSelectedCustomer(customer);
    setPanelOpen(true);
  };

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">CRM</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading..." : `${customers.length} guests`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/bookings/new"
              className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Booking</span>
            </Link>
          </div>
        </div>

        {/* Summary cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            { label: "Total Guests", value: customers.length },
            { label: "VIP Guests", value: customers.filter(isVIP).length },
            { label: "New (30d)", value: customers.filter(isNew).length },
            {
              label: "Total Revenue",
              value: formatCurrency(customers.reduce((s, c) => s + getTotalSpend(c), 0)),
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={staggerItem}
              className="bg-card rounded-xl border border-border p-3 md:p-4"
            >
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-xl md:text-2xl font-bold text-foreground">{stat.value}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-4">
            Failed to load customers. Please refresh.
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Guest</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Bookings</th>
                <th className="text-left px-4 py-3 font-medium">Last Stay</th>
                <th className="text-left px-4 py-3 font-medium">Total Spend</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Loading guests...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No guests found.
                  </td>
                </tr>
              ) : (
                filtered.map((customer) => {
                  const lastStay = getLastStay(customer);
                  const totalSpend = getTotalSpend(customer);
                  const vip = isVIP(customer);
                  const newGuest = isNew(customer);
                  return (
                    <motion.tr
                      key={customer.id}
                      variants={staggerItem}
                      onClick={() => openPanel(customer)}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                              {getInitials(customer.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-foreground">{customer.full_name}</p>
                            <p className="text-xs text-muted-foreground">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                        {customer.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground font-semibold">
                        {customer.bookings.length}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lastStay ? formatDate(lastStay) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatCurrency(totalSpend)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {vip && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-300/30">
                              VIP
                            </span>
                          )}
                          {newGuest && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                              New
                            </span>
                          )}
                          {!vip && !newGuest && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                              Regular
                            </span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </motion.tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-8">Loading guests...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No guests found.
            </div>
          ) : (
            filtered.map((customer) => {
              const lastStay = getLastStay(customer);
              const totalSpend = getTotalSpend(customer);
              const vip = isVIP(customer);
              const newGuest = isNew(customer);
              return (
                <motion.div
                  key={customer.id}
                  variants={staggerItem}
                  onClick={() => openPanel(customer)}
                  className="bg-card rounded-xl border border-border p-4 cursor-pointer active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                        {getInitials(customer.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{customer.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                    </div>
                    <div className="flex gap-1 flex-col items-end">
                      {vip && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-300/30">
                          VIP
                        </span>
                      )}
                      {newGuest && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                          New
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">{customer.bookings.length}</p>
                      <p>Bookings</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{lastStay ? formatDate(lastStay) : "—"}</p>
                      <p>Last Stay</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-right">{formatCurrency(totalSpend)}</p>
                      <p className="text-right">Spent</p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* Guest detail panel */}
      <GuestPanel
        customer={selectedCustomer}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </PageTransition>
  );
}
