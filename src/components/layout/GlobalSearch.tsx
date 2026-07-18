import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CalendarCheck, DoorOpen, Users, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { getBookings, searchCustomers } from "@/services/bookingService";
import { useRooms, useRoomTypes } from "@/hooks/useRooms";

/**
 * App-wide search over the real data: bookings, guests, rooms and room types.
 * Opens on the "/" key or by clicking the top-bar search box; selecting a result
 * navigates to it. Bookings and guests are queried on the typed term; rooms and
 * room types are small enough to filter from the already-cached lists.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  const { data: rooms = [] } = useRooms();
  const { data: roomTypes = [] } = useRoomTypes();

  // "/" opens search, unless the user is typing into a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  const q = debounced.toLowerCase();

  const { data: bookings = [] } = useQuery({
    queryKey: ["search", "bookings", debounced],
    queryFn: async () => (await getBookings({ search: debounced, pageSize: 6 })).data,
    enabled: debounced.length >= 2,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["search", "customers", debounced],
    queryFn: () => searchCustomers(debounced),
    enabled: debounced.length >= 2,
  });

  const roomHits = q.length >= 1 ? rooms.filter((r) => r.number.toLowerCase().includes(q)).slice(0, 6) : [];
  const typeHits = q.length >= 1 ? roomTypes.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6) : [];

  function go(path: string) { setOpen(false); setTerm(""); navigate(path); }

  return (
    <>
      {/* Wide trigger only from lg: at md the sidebar already takes 224px, so a
          288px search box pushed the top bar past the viewport. Below lg the
          icon button below is used instead. */}
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-2 bg-muted rounded-lg px-4 py-2.5 w-56 xl:w-72 shrink-0 text-left text-muted-foreground hover:bg-accent transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="text-sm flex-1 truncate">Search room, guest, book…</span>
        <kbd className="hidden xl:inline-flex items-center text-[10px] border border-border rounded px-1.5 py-0.5 font-mono shrink-0">/</kbd>
      </button>
      {/* Compact trigger (mobile + tablet) */}
      <button onClick={() => setOpen(true)} aria-label="Cari" className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors touch-target btn-press">
        <Search className="w-5 h-5" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cari booking, tamu, kamar, tipe…" value={term} onValueChange={setTerm} />
        <CommandList>
          {debounced.length < 2 && roomHits.length === 0 && typeHits.length === 0 && (
            <CommandEmpty>Ketik minimal 2 huruf…</CommandEmpty>
          )}
          {debounced.length >= 2 && bookings.length === 0 && customers.length === 0 && roomHits.length === 0 && typeHits.length === 0 && (
            <CommandEmpty>Tidak ada hasil.</CommandEmpty>
          )}

          {bookings.length > 0 && (
            <CommandGroup heading="Booking">
              {bookings.map((b) => (
                <CommandItem key={b.id} value={`${b.reference} ${b.customers?.full_name ?? ""} ${b.id}`} onSelect={() => go(`/bookings/${b.id}`)}>
                  <CalendarCheck className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="font-medium">{b.reference}</span>
                  <span className="ml-2 text-muted-foreground">{b.customers?.full_name} · {b.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {customers.length > 0 && (
            <CommandGroup heading="Tamu">
              {customers.map((c) => (
                <CommandItem key={c.id} value={`${c.full_name} ${c.email} ${c.id}`} onSelect={() => go(`/crm`)}>
                  <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="font-medium">{c.full_name}</span>
                  <span className="ml-2 text-muted-foreground">{c.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {roomHits.length > 0 && (
            <CommandGroup heading="Kamar">
              {roomHits.map((r) => (
                <CommandItem key={r.id} value={`kamar ${r.number} ${r.room_types?.name ?? ""} ${r.id}`} onSelect={() => go(`/rooms`)}>
                  <DoorOpen className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="font-medium">Kamar {r.number}</span>
                  <span className="ml-2 text-muted-foreground">{r.room_types?.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {typeHits.length > 0 && (
            <CommandGroup heading="Tipe Kamar">
              {typeHits.map((t) => (
                <CommandItem key={t.id} value={`${t.name} ${t.id}`} onSelect={() => go(`/rooms/types/${t.id}`)}>
                  <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="font-medium">{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
