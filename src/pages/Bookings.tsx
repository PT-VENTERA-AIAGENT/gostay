import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Filter, Download, Calendar, List, Eye, CalendarPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import BookingCalendar from "@/components/bookings/BookingCalendar";
import CopyButton from "@/components/shared/CopyButton";
import { useBookings } from "@/hooks/useBookings";
import { exportCSV } from "@/components/analytics/ExportUtils";
import type { BookingStatus } from "@/types/database.types";

const statusConfig: Record<string, { label: string; cls: string }> = {
  pending:     { label: "Pending",     cls: "badge-warning" },
  confirmed:   { label: "Confirmed",   cls: "badge-info" },
  checked_in:  { label: "Checked In",  cls: "badge-primary" },
  checked_out: { label: "Checked Out", cls: "badge-muted" },
  cancelled:   { label: "Cancelled",   cls: "badge-destructive" },
  no_show:     { label: "No Show",     cls: "badge-destructive" },
};

const statusTabs = [
  { key: "all",         label: "All" },
  { key: "pending",     label: "Pending" },
  { key: "confirmed",   label: "Confirmed" },
  { key: "checked_in",  label: "Checked In" },
  { key: "checked_out", label: "Checked Out" },
  { key: "cancelled",   label: "Cancelled" },
];

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function Bookings() {
  // The view lives in the URL so the sidebar's Calendar link (/bookings?view=calendar)
  // actually lands on the calendar — it used to be local state, so that link
  // opened the list and the nav item did nothing.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: "list" | "calendar" = searchParams.get("view") === "calendar" ? "calendar" : "list";
  const setView = (v: "list" | "calendar") => {
    const next = new URLSearchParams(searchParams);
    if (v === "calendar") next.set("view", "calendar");
    else next.delete("view");
    setSearchParams(next, { replace: true });
  };
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, error } = useBookings({
    status: activeTab as BookingStatus | "all",
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const bookings = data?.data ?? [];
  const totalCount = data?.count ?? 0;

  function handleExport() {
    exportCSV(
      ["Reference", "Guest", "Room", "Check-in", "Check-out", "Status", "Payment", "Total (IDR)"],
      bookings.map((b) => [
        b.reference,
        b.customers?.full_name ?? "",
        b.rooms?.number ?? "",
        b.check_in,
        b.check_out,
        b.status,
        b.payment_status,
        Number(b.total_amount),
      ]),
      `gostay-bookings-${activeTab}.csv`,
    );
  }

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
        <div className="p-6 text-center text-sm text-destructive">Failed to load bookings. Please try again.</div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Reservations</h1>
            <p className="text-sm text-muted-foreground mt-1">{totalCount} total bookings</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={handleExport} disabled={bookings.length === 0} className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors btn-press disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /> <span className="hidden md:inline">Export CSV</span>
            </button>
            <Link to="/bookings/new" className="bg-primary text-primary-foreground px-3 md:px-4 py-2 md:py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Booking</span>
            </Link>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-3 flex-1">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 sm:max-w-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest, ref, room..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
            </div>
            <button onClick={() => setShowFilter((v) => !v)} className={cn("hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg border text-sm font-medium transition-colors btn-press", showFilter || dateFrom || dateTo ? "border-primary text-primary bg-primary/5" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
              <Filter className="w-4 h-4" /> Filter
            </button>
          </div>
          <div className="flex items-center bg-muted rounded-lg p-1 self-start">
            <button onClick={() => setView("list")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 btn-press", view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              <List className="w-4 h-4" /> List
            </button>
            <button onClick={() => setView("calendar")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 btn-press", view === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              <Calendar className="w-4 h-4" /> Calendar
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card border border-border rounded-lg p-3 md:p-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in dari</label>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Dari tanggal" className="sm:w-44" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Check-in sampai</label>
              <DatePicker value={dateTo} onChange={setDateTo} min={dateFrom || undefined} placeholder="Sampai tanggal" className="sm:w-44" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-sm text-primary font-medium hover:underline py-2">Reset tanggal</button>
            )}
          </div>
        )}

        {view === "list" ? (
          <>
            <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
              {statusTabs.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap touch-target", activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Reference</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Guest</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Room</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Check-in</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Check-out</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Total</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Source</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap"></th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                  {bookings.map((b) => {
                    const sc = statusConfig[b.status];
                    return (
                      <motion.tr key={b.id} variants={staggerItem} className="border-b border-border last:border-0 table-row-hover">
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-medium text-primary">{b.reference}</span>
                            <CopyButton text={b.reference} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{b.customers?.full_name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{b.rooms?.number} · {b.rooms?.room_types?.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{b.check_in}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{b.check_out}</td>
                        <td className="px-4 py-3"><span className={cn("text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap inline-block", sc.cls)}>{sc.label}</span></td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground tabular-nums">{formatIDR(b.total_amount)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize whitespace-nowrap">{b.source.replace("_", " ")}</td>
                        <td className="px-4 py-3">
                          <Link to={`/bookings/${b.id}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="View details">
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </motion.tr>
                    );
                  })}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-16 text-center">
                        <CalendarPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground mb-1">No bookings found</p>
                        <p className="text-xs text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
                        <button onClick={() => { setSearch(""); setActiveTab("all"); }} className="text-sm text-primary font-medium hover:underline">Clear filters</button>
                      </td>
                    </tr>
                  )}
                </motion.tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
              {bookings.map((b) => {
                const sc = statusConfig[b.status];
                return (
                  <motion.div key={b.id} variants={staggerItem}>
                    <Link to={`/bookings/${b.id}`} className="block bg-card rounded-xl border border-border p-4 hover:shadow-sm transition-shadow active:scale-[0.99]">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{b.customers?.full_name}</p>
                          <p className="text-xs font-mono text-primary">{b.reference}</p>
                        </div>
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap inline-block", sc.cls)}>{sc.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{b.rooms?.number} · {b.rooms?.room_types?.name}</span>
                        <span>{b.check_in} → {b.check_out}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground mt-2 tabular-nums">{formatIDR(b.total_amount)}</p>
                    </Link>
                  </motion.div>
                );
              })}
              {bookings.length === 0 && (
                <div className="text-center py-12">
                  <CalendarPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No bookings found</p>
                  <p className="text-xs text-muted-foreground mb-4">Try adjusting your search or filter</p>
                  <button onClick={() => { setSearch(""); setActiveTab("all"); }} className="text-sm text-primary font-medium hover:underline">Clear filters</button>
                </div>
              )}
            </motion.div>
          </>
        ) : (
          <BookingCalendar />
        )}
      </div>
    </PageTransition>
  );
}
