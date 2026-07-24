import { useMemo, useState } from "react";
import { MessageSquare, Search, Loader2, Building2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { ChatAttachment } from "@/components/shared/ChatAttachment";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/i18n";
import { usePlatformThreads, usePlatformThreadMessages } from "@/hooks/usePlatform";

// Percakapan SELURUH hotel — tempatnya di konsol platform, bukan di inbox hotel.
// Halaman Pesan milik hotel kini tenant-scoped untuk semua orang (035), jadi ini
// satu-satunya tampilan lintas hotel, dan setiap thread diberi label hotelnya.
// Read-only: membalas atas nama sebuah hotel bukan wewenang operator platform.

function fmtWhen(s: string) {
  const d = new Date(s);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export default function PlatformMessages() {
  const { data: threads = [], isLoading } = usePlatformThreads();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const hotels = useMemo(() => Array.from(new Set(threads.map((t) => t.hotel))).sort(), [threads]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return threads.filter((t) =>
      (!hotel || t.hotel === hotel) &&
      (!s || (t.guest + t.hotel + (t.phone ?? "")).toLowerCase().includes(s)));
  }, [threads, q, hotel]);

  const activeThread = threads.find((t) => t.id === selected) ?? null;
  const { data: messages = [], isLoading: loadingMsgs } = usePlatformThreadMessages(selected);

  return (
    <PageTransition>
      <div className="p-4 md:p-6">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" /> {tr("Semua Pesan")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("Percakapan tamu dari seluruh hotel. Hanya baca — balasan dilakukan oleh staf hotelnya.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Cari tamu / hotel / nomor...")}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
          <select value={hotel} onChange={(e) => setHotel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
            <option value="">{tr("Semua hotel")}</option>
            {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        <div className="grid md:grid-cols-[minmax(260px,340px)_1fr] gap-4">
          {/* Daftar percakapan */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : visible.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">{tr("Tidak ada percakapan")}</p>
            ) : (
              <ul className="divide-y divide-border/60 max-h-[70vh] overflow-y-auto">
                {visible.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelected(t.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors",
                        selected === t.id && "bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground truncate">{t.guest}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{fmtWhen(t.updated_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Building2 className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-xs text-primary truncate">{t.hotel}</span>
                        {t.unread > 0 && (
                          <span className="ml-auto text-[10px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 shrink-0">
                            {t.unread}
                          </span>
                        )}
                      </div>
                      {t.last_message && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{t.last_message}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Transkrip */}
          <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
            {!activeThread ? (
              <p className="text-center text-sm text-muted-foreground py-20">{tr("Pilih percakapan untuk melihat isinya")}</p>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <p className="font-semibold text-foreground">{activeThread.guest}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeThread.hotel}
                    {activeThread.phone ? ` · ${activeThread.phone}` : ""}
                    {` · ${activeThread.status}`}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[62vh] p-4 space-y-3">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-16">{tr("Belum ada pesan")}</p>
                  ) : (
                    messages.map((m) => {
                      // Sisi tamu = pengirimnya profil tamu pemilik thread; sisanya
                      // staf/bot hotel. Aturan yang sama dipakai halaman Pesan hotel.
                      const fromGuest = m.sender_id === activeThread.guest_profile_id;
                      return (
                        <div key={m.id} className={cn("flex", fromGuest ? "justify-start" : "justify-end")}>
                          <div className={cn(
                            "max-w-[80%] rounded-2xl px-4 py-2.5",
                            fromGuest ? "bg-muted text-foreground rounded-bl-md" : "bg-primary text-primary-foreground rounded-br-md",
                          )}>
                            {m.attachment_url && (
                              <ChatAttachment value={m.attachment_url} name={m.content} onLight={!fromGuest} />
                            )}
                            {!m.attachment_url && <p className="text-sm whitespace-pre-line">{m.content}</p>}
                            <span className={cn("block text-[11px] mt-1", fromGuest ? "text-muted-foreground" : "text-primary-foreground/70")}>
                              {new Date(m.created_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
