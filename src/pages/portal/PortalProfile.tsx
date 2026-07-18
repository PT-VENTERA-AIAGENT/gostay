import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Save, ShieldCheck, Loader2, User } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useMyProfile, useUpdateMyProfile } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const SSO_ACCOUNT_URL = (import.meta.env.VITE_SSO_ISSUER as string) ?? "https://sso.ventera.ai";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function memberSince(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function PortalProfile() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const updateProfile = useUpdateMyProfile();
  const { toast } = useToast();

  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seeded from the row rather than held as defaultValue: the query resolves
  // after first paint, and an uncontrolled input would keep showing empty.
  useEffect(() => {
    if (profile) setPhone(profile.phone ?? "");
  }, [profile]);

  const name = profile?.full_name || user?.name || user?.email || "Guest";
  const dirty = profile ? phone !== (profile.phone ?? "") : false;

  async function handleSave() {
    setError(null);
    try {
      await updateProfile.mutateAsync({ phone: phone.trim() || null });
      toast({ title: "Profile updated", description: "Your phone number has been saved." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile.");
    }
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading profile…
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Profile Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your personal information</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-center gap-4">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/20 flex items-center justify-center text-xl md:text-2xl font-bold text-primary">
            {initials(name)}
          </div>
          <div>
            <p className="font-semibold text-foreground">{name}</p>
            {memberSince(profile?.created_at) && (
              <p className="text-sm text-muted-foreground">Member since {memberSince(profile?.created_at)}</p>
            )}
          </div>
        </motion.div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
          {/* Name and email are owned by Ventera and rewritten from the SSO
              claims on every sign-in, so they are shown, not offered for edit —
              an input here would accept a change and silently lose it. */}
          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-foreground">Ventera Account</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" /> Managed by SSO
              </span>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={name} readOnly disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground cursor-not-allowed" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={profile?.email ?? user?.email ?? ""} readOnly disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground cursor-not-allowed" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Your name, email and password live in your Ventera account — GoStay never sees a password.{" "}
              <a href={SSO_ACCOUNT_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Manage them at Ventera
              </a>
              .
            </p>
          </motion.div>

          <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
            <h2 className="font-semibold text-foreground">Contact</h2>
            <div>
              <label htmlFor="phone" className="text-sm font-medium text-foreground mb-1.5 block">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="phone" type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+62 812 3456 7890"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">How the hotel reaches you about a stay.</p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">{error}</div>
            )}

            <div className="flex justify-end">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={!dirty || updateProfile.isPending}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 btn-press disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateProfile.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><Save className="w-4 h-4" /> Save Changes</>}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
