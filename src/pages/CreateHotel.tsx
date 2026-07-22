import { useEffect, useState } from "react";
import { Building2, Loader2, Store } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";

/**
 * Self-serve hotel creation (PRD §2.2, path 1).
 *
 * A signed-in user who does not yet run a hotel names one here and becomes its
 * owner (`staff`). The backend (POST /api/hotel/create-mine) creates the tenant
 * and re-homes the caller's profile onto it; the request carries the Supabase
 * JWT from the SSO session as a bearer token — the server is the authority on
 * who may do this and only ever acts on the caller's own profile.
 *
 * On success we re-run the SSO exchange (signIn) so the session picks up the new
 * `staff` role and tenant, then land on the dashboard of the fresh hotel.
 */

function toKebab(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function messageForError(error: string | undefined): string {
  switch (error) {
    case "slug_taken":
      return "Nama/slug hotel sudah dipakai. Coba yang lain.";
    case "already_in_hotel":
      return "Akun Anda sudah terhubung ke sebuah hotel.";
    case "invalid_slug":
      return "Slug tidak valid. Hanya huruf kecil, angka, dan tanda hubung.";
    default:
      return error || "Terjadi kesalahan. Coba lagi.";
  }
}

export default function CreateHotel() {
  const { session, signIn, role } = useAuth();
  const { toast } = useToast();
  const token = session?.supabase_token ?? null;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slugEdited) setSlug(toKebab(name));
  }, [name, slugEdited]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const finalSlug = toKebab(slug);
    if (!name.trim() || !finalSlug) {
      toast({ title: tr("Lengkapi data"), description: tr("Nama hotel wajib diisi."), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/create-mine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim(), slug: finalSlug }),
      });
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = await res.json();
      } catch {
        throw new Error(`Server membalas ${res.status}.`);
      }
      if (!res.ok || !body.ok) {
        throw new Error(messageForError(body.error));
      }

      toast({ title: tr("Hotel dibuat"), description: tr("Menyiapkan dasbor hotel Anda…") });
      // Re-run the SSO exchange so the session reflects the new staff role and
      // tenant, then land on the new hotel's dashboard.
      signIn("/dashboard");
    } catch (err) {
      toast({ title: tr("Gagal membuat hotel"), description: (err as Error).message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={staggerItem} className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Store className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">{tr("Buat Hotel Anda")}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {tr("Daftarkan hotel Anda dan mulai kelola booking. Anda akan menjadi pemilik (staff) hotel ini.")}
              </p>
            </motion.div>

            <motion.form variants={staggerItem} onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{tr("Nama hotel")}</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    placeholder="Hotel Melati Indah"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{tr("Slug")}</label>
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
                  {tr("Dibuat otomatis dari nama; bisa diubah. Hanya huruf kecil, angka, dan tanda hubung.")}
                </p>
              </div>

              <motion.button
                type="submit"
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {tr("Buat Hotel")}
              </motion.button>

              {role === "staff" && (
                <p className="text-xs text-center text-muted-foreground">
                  {tr("Akun Anda sudah terhubung ke sebuah hotel.")}
                </p>
              )}
            </motion.form>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
