import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, QrCode, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { motion } from "framer-motion";
import { useT, tr } from "@/lib/i18n";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Chatly-style self-service WhatsApp linking.
 *
 * Frontend only. The backend (built in parallel) owns the WhatsApp session
 * lifecycle behind three endpoints; this page is a small state machine driven
 * by polling GET /api/wa/connect every 2.5s. The `status` field decides what we
 * render, so no local state can drift from the server's truth.
 */

const POLL_INTERVAL_MS = 2500;

type WaStatus = "none" | "pairing" | "qr" | "connecting" | "open" | "closed";

interface WaState {
  status: WaStatus;
  qr?: string;
  connected: boolean;
  linkedNumber?: string;
}

interface ConnectResponse {
  ok: boolean;
  sessionId?: string;
  error?: string;
}

export default function WhatsApp() {
  const t = useT();
  const { session } = useAuth();
  const { toast } = useToast();
  const token = session?.supabase_token ?? null;

  const [state, setState] = useState<WaState>({ status: "none", connected: false });
  const [busy, setBusy] = useState(false);
  // Distinguishes "we have never heard from the server" from a real 'none', so
  // the empty state does not flash before the first poll resolves.
  const [loaded, setLoaded] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /**
   * Injects the bearer token and always returns parsed JSON. Kept inside the
   * component so it closes over the current token, and memoised so the polling
   * effect does not restart on every render.
   */
  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new Error(`Server membalas ${res.status}.`);
      }
      if (!res.ok && body && typeof body === "object" && "error" in body) {
        throw new Error(String((body as { error?: string }).error ?? `Server membalas ${res.status}.`));
      }
      if (!res.ok) {
        throw new Error(`Server membalas ${res.status}.`);
      }
      return body as T;
    },
    [token],
  );

  const fetchStatus = useCallback(async () => {
    try {
      const next = await apiFetch<WaState>("/api/wa/connect");
      setState(next);
      setLoaded(true);
      if (next.status === "open") stopPolling();
    } catch {
      // A transient poll failure should not tear down the UI; keep the last
      // known state and let the next tick retry.
    }
  }, [apiFetch, stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    void fetchStatus();
    pollRef.current = setInterval(() => void fetchStatus(), POLL_INTERVAL_MS);
  }, [fetchStatus, stopPolling]);

  // On mount, do one status check — a session may already exist for this hotel.
  // Only keep polling if it is mid-flight (not a settled none/open/closed).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await apiFetch<WaState>("/api/wa/connect");
        if (!active) return;
        setState(next);
        setLoaded(true);
        if (next.status === "pairing" || next.status === "qr" || next.status === "connecting") {
          startPolling();
        }
      } catch {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const res = await apiFetch<ConnectResponse>("/api/wa/connect", { method: "POST" });
      if (!res.ok) throw new Error(res.error ?? "Gagal memulai sesi WhatsApp.");
      setState((s) => ({ ...s, status: "pairing" }));
      startPolling();
    } catch (e) {
      toast({
        title: tr("Gagal menyambungkan"),
        description: (e as Error).message || "Terjadi kesalahan. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [apiFetch, startPolling, toast]);

  const unlink = useCallback(async () => {
    if (!window.confirm("Lepas tautan WhatsApp? Tamu tidak bisa memesan lewat chat sampai Anda menautkan ulang.")) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch<{ ok: boolean }>("/api/wa/connect", { method: "DELETE" });
      stopPolling();
      setState({ status: "none", connected: false });
      toast({ title: tr("Tautan WhatsApp dilepas") });
    } catch (e) {
      toast({
        title: tr("Gagal melepas tautan"),
        description: (e as Error).message || "Terjadi kesalahan. Coba lagi.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [apiFetch, stopPolling, toast]);

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("Sambungkan WhatsApp")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tautkan nomor WhatsApp hotel agar tamu bisa memesan lewat chat.
            </p>
          </div>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show">
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-6 md:p-8">
            {!loaded ? (
              <CenteredSpinner label="Memuat status…" />
            ) : state.status === "none" ? (
              <EmptyState onConnect={connect} busy={busy} />
            ) : state.status === "pairing" ? (
              <CenteredSpinner label="Menyiapkan sesi…" />
            ) : state.status === "qr" ? (
              <QrState qr={state.qr} />
            ) : state.status === "connecting" ? (
              <CenteredSpinner label="Menghubungkan…" />
            ) : state.status === "open" ? (
              <ConnectedState linkedNumber={state.linkedNumber} onUnlink={unlink} busy={busy} />
            ) : (
              <ClosedState onReconnect={connect} busy={busy} />
            )}
          </motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ onConnect, busy }: { onConnect: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Smartphone className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{tr("Sambungkan WhatsApp")}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
        Tautkan nomor WhatsApp hotel Anda agar tamu bisa mengecek kamar dan melakukan pemesanan langsung
        lewat percakapan WhatsApp.
      </p>
      <motion.button
        onClick={onConnect}
        disabled={busy}
        whileTap={{ scale: 0.97 }}
        className="mt-6 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Sambungkan
      </motion.button>
    </div>
  );
}

function QrState({ qr }: { qr?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-2">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <QrCode className="w-5 h-5 text-primary" /> Scan QR ini
      </h2>
      <div className="mt-5 rounded-xl border border-border bg-background p-3">
        {qr ? (
          <img src={qr} alt="QR WhatsApp" className="w-64 h-64" />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-5 max-w-sm leading-relaxed">
        Buka WhatsApp di HP → Setelan → Perangkat Tertaut → Tautkan Perangkat, lalu scan QR ini.
      </p>
      <p className="text-xs text-muted-foreground mt-2">{tr("QR berganti otomatis.")}</p>
    </div>
  );
}

function ConnectedState({
  linkedNumber,
  onUnlink,
  busy,
}: {
  linkedNumber?: string;
  onUnlink: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-success" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">WhatsApp tertaut</h2>
      {linkedNumber && (
        <p className="text-sm text-muted-foreground mt-1.5">
          Nomor tertaut: <span className="font-mono font-medium text-foreground">{linkedNumber}</span>
        </p>
      )}
      <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
        Tamu sekarang bisa memesan kamar lewat WhatsApp hotel Anda.
      </p>
      <motion.button
        onClick={onUnlink}
        disabled={busy}
        whileTap={{ scale: 0.97 }}
        className="mt-6 inline-flex items-center justify-center gap-2 border border-destructive/40 text-destructive px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-destructive/5 transition-colors disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Lepas tautan
      </motion.button>
    </div>
  );
}

function ClosedState({ onReconnect, busy }: { onReconnect: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Tertaut terputus</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
        Koneksi WhatsApp hotel terputus. Sambungkan ulang untuk menerima pesanan lewat chat kembali.
      </p>
      <motion.button
        onClick={onReconnect}
        disabled={busy}
        whileTap={{ scale: 0.97 }}
        className="mt-6 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Sambungkan ulang
      </motion.button>
    </div>
  );
}
