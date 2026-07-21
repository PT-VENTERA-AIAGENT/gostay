import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  User,
  Mail,
  Phone,
  MessageCircle,
  Loader2,
  QrCode,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * "Tambah Hotel" onboarding wizard (platform-admin only).
 *
 * This is the frontend of a three-step flow whose backend lives elsewhere:
 *   1. Provision the tenant + first staff account  → POST /api/admin/onboard-hotel
 *   2. Pair the hotel's WhatsApp by scanning a QR   → poll .../qr + .../status
 *   3. Confirm the hotel is live
 *
 * Every call carries the Supabase-compatible JWT from the SSO session as a
 * bearer token; the server is the real authority on who may onboard a hotel
 * (this page only decides what the browser renders).
 */

type Step = 1 | 2 | 3;

interface OnboardResponse {
  ok: boolean;
  tenantId?: string;
  slug?: string;
  error?: string;
}

interface QrResponse {
  status: string;
  qr?: string;
}

interface StatusResponse {
  status: string;
  connected: boolean;
  done: boolean;
}

/** Turn "Hotel Melati Indah" into "hotel-melati-indah". */
function toKebab(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Friendly Indonesian copy for the error codes the contract can return. */
function messageForError(error: string | undefined): string {
  switch (error) {
    case "not_platform_admin":
      return "Anda tidak punya akses untuk menambah hotel.";
    case "slug_taken":
      return "Slug sudah dipakai hotel lain. Silakan ubah.";
    default:
      return error || "Terjadi kesalahan. Coba lagi.";
  }
}

export default function AddHotel() {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const token = session?.supabase_token ?? null;

  /**
   * Small fetch wrapper that injects the bearer token and always returns parsed
   * JSON. Kept inside the component so it closes over the current token, and
   * memoised so the polling effect does not restart on every render.
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
      // Endpoints return JSON on both success and error; if the body is not
      // JSON (e.g. a proxy 502), surface a generic failure rather than throwing
      // an opaque SyntaxError.
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new Error(`Server membalas ${res.status}.`);
      }
      if (!res.ok && body && typeof body === "object" && "error" in body) {
        throw new Error(messageForError((body as { error?: string }).error));
      }
      if (!res.ok) {
        throw new Error(`Server membalas ${res.status}.`);
      }
      return body as T;
    },
    [token],
  );

  const [step, setStep] = useState<Step>(1);

  // --- Step 1 form state ---
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [staffFullName, setStaffFullName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [botNumber, setBotNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // The slug tracks the name until the admin edits it by hand.
  useEffect(() => {
    if (!slugEdited) setSlug(toKebab(name));
  }, [name, slugEdited]);

  // The slug actually paired/provisioned. Set once onboarding succeeds and used
  // by every step-2 request, so editing the field afterwards cannot desync.
  const [activeSlug, setActiveSlug] = useState("");

  // --- Step 2 pairing state ---
  const [qr, setQr] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<string>("pending");
  const cancelledRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const finalSlug = toKebab(slug);
    if (!name.trim() || !finalSlug || !staffFullName.trim() || !staffEmail.trim() || !staffPhone.trim()) {
      toast({ title: "Lengkapi data", description: "Semua kolom wajib diisi kecuali WA hotel.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<OnboardResponse>("/api/admin/onboard-hotel", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: finalSlug,
          staffFullName: staffFullName.trim(),
          staffEmail: staffEmail.trim(),
          staffPhone: staffPhone.trim(),
          ...(botNumber.trim() ? { botNumber: botNumber.trim() } : {}),
        }),
      });

      if (!data.ok) {
        throw new Error(messageForError(data.error));
      }

      setActiveSlug(data.slug ?? finalSlug);
      cancelledRef.current = false;
      setQr(null);
      setPairingStatus("pending");
      setStep(2);
      toast({ title: "Hotel dibuat", description: "Lanjut hubungkan WhatsApp." });
    } catch (err) {
      toast({ title: "Gagal menambah hotel", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // Poll the QR and connection status while on step 2. One effect drives both
  // requests on a ~3s tick; it tears down on unmount, on cancel, or when we
  // leave the step.
  useEffect(() => {
    if (step !== 2 || !activeSlug) return;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const [qrRes, statusRes] = await Promise.all([
          apiFetch<QrResponse>(`/api/admin/wa-session/${encodeURIComponent(activeSlug)}/qr`),
          apiFetch<StatusResponse>(`/api/admin/wa-session/${encodeURIComponent(activeSlug)}/status`),
        ]);
        if (cancelledRef.current) return;

        if (qrRes.qr) setQr(qrRes.qr);
        setPairingStatus(statusRes.status || qrRes.status || "pending");

        if (statusRes.connected || statusRes.done) {
          if (timer) clearInterval(timer);
          setStep(3);
        }
      } catch {
        // Transient poll failures are expected while the session spins up; keep
        // polling rather than nagging the admin with a toast on every tick.
        setPairingStatus("menghubungkan");
      }
    };

    void tick();
    timer = setInterval(tick, 3000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, activeSlug, apiFetch]);

  async function handleCancel() {
    cancelledRef.current = true;
    const slugToCancel = activeSlug;
    setStep(1);
    setQr(null);
    setPairingStatus("pending");
    try {
      if (slugToCancel) {
        await apiFetch<{ ok: boolean }>(`/api/admin/wa-session/${encodeURIComponent(slugToCancel)}/cancel`, {
          method: "POST",
        });
      }
      toast({ title: "Dibatalkan", description: "Penyambungan WhatsApp dibatalkan." });
    } catch (err) {
      toast({ title: "Gagal membatalkan", description: (err as Error).message, variant: "destructive" });
    }
  }

  function resetForAnother() {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setStaffFullName("");
    setStaffEmail("");
    setStaffPhone("");
    setBotNumber("");
    setActiveSlug("");
    setQr(null);
    setPairingStatus("pending");
    setStep(1);
  }

  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: "Data Hotel" },
    { n: 2, label: "Sambungkan WA" },
    { n: 3, label: "Selesai" },
  ];

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Tambah Hotel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onboarding hotel baru: buat akun, lalu sambungkan WhatsApp untuk mulai menerima booking.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                    step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${step >= s.n ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 rounded-full transition-colors ${step > s.n ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Form */}
        {step === 1 && (
          <form onSubmit={handleSubmit}>
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" /> Data Hotel
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Nama hotel</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Hotel Melati Indah"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Slug</label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setSlug(e.target.value);
                      }}
                      onBlur={() => setSlug((s) => toKebab(s))}
                      required
                      placeholder="hotel-melati-indah"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Dibuat otomatis dari nama hotel; bisa diubah. Hanya huruf kecil, angka, dan tanda hubung.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" /> Staff Awal
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Nama staff</label>
                    <input
                      type="text"
                      value={staffFullName}
                      onChange={(e) => setStaffFullName(e.target.value)}
                      required
                      placeholder="Budi Santoso"
                      className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Email staff</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="email"
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        required
                        placeholder="staff@hotel.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">No. HP staff</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="tel"
                        value={staffPhone}
                        onChange={(e) => setStaffPhone(e.target.value)}
                        required
                        placeholder="+62 812 3456 7890"
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" /> WhatsApp Hotel <span className="text-xs font-normal text-muted-foreground">(opsional)</span>
                </h2>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Nomor / label WA hotel</label>
                  <input
                    type="text"
                    value={botNumber}
                    onChange={(e) => setBotNumber(e.target.value)}
                    placeholder="+62 811 0000 0000"
                    className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Nomor WhatsApp yang akan dipakai bot hotel. Boleh dikosongkan, isi belakangan.
                  </p>
                </div>
              </motion.div>

              <motion.div variants={staggerItem}>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileTap={{ scale: 0.97 }}
                  className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity touch-target disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Buat Hotel & Lanjut
                </motion.button>
              </motion.div>
            </motion.div>
          </form>
        )}

        {/* Step 2: Pairing */}
        {step === 2 && (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-6 md:p-8 text-center">
              <h2 className="font-semibold text-foreground mb-1 flex items-center justify-center gap-2">
                <QrCode className="w-4 h-4" /> Scan QR pakai WhatsApp HP hotel
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Buka WhatsApp di HP hotel → Perangkat Tertaut → Tautkan Perangkat, lalu scan QR di bawah.
              </p>

              <div className="mx-auto w-56 h-56 rounded-xl border border-border bg-background flex items-center justify-center overflow-hidden">
                {qr ? (
                  <img src={qr} alt="QR WhatsApp" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-xs">Menyiapkan QR…</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3 h-3" />
                Status: {pairingStatus}. QR menyegar otomatis.
              </p>
            </motion.div>

            <motion.div variants={staggerItem}>
              <button
                type="button"
                onClick={handleCancel}
                className="w-full py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors touch-target"
              >
                Batal
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
            <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-6 md:p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">{name || "Hotel"} berhasil ditambahkan</h2>
              <p className="text-sm text-muted-foreground">Hotel siap menerima booking WhatsApp.</p>
            </motion.div>

            <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={resetForAnother}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors touch-target"
              >
                Tambah Hotel Lain
              </button>
              <motion.button
                type="button"
                onClick={() => navigate("/dashboard")}
                whileTap={{ scale: 0.97 }}
                className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity touch-target flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Ke Dashboard
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
