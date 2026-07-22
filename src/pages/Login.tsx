import { useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth, roleHome } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { tr } from "@/lib/i18n";

export default function Login() {
  const { session, role, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const from = (location.state as { from?: string })?.from ?? "/";

  // Already signed in: don't sit on the login screen. Honour a real returnTo,
  // otherwise send them to their role's home rather than back to "/", which is
  // the marketing page and would just show "Masuk" again.
  useEffect(() => {
    if (session) navigate(from !== "/" ? from : roleHome(role), { replace: true });
  }, [session]);

  useEffect(() => {
    if (searchParams.get("error") === "sso_failed") {
      toast({
        title: tr("Login gagal"),
        description: tr("Tidak dapat memverifikasi sesi SSO. Coba lagi."),
        variant: "destructive",
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="w-24 h-24 mx-auto mb-3"
          >
            <img src="/gostay.svg" alt="GoStay" className="w-full h-full object-contain" />
          </motion.div>
          <p className="text-muted-foreground text-sm">Sistem Manajemen Hotel</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-1">Masuk ke Dashboard</p>
            <p className="text-xs text-muted-foreground">Login menggunakan akun Ventera kamu</p>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => signIn(from)}
            className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="4" fill="white" fillOpacity="0.2" />
              <path d="M10 4L4 7.5V12.5L10 16L16 12.5V7.5L10 4Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="10" cy="10" r="2" fill="white" />
            </svg>
            Login dengan Ventera SSO
          </motion.button>

          <p className="text-center text-xs text-muted-foreground">
            Akses hanya untuk staf dan admin hotel yang terdaftar di Ventera.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
