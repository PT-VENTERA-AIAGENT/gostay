import { useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth, roleHome } from "@/contexts/AuthContext";
import { tr } from "@/lib/i18n";

/**
 * /login is a redirect, not a page.
 *
 * Ventera SSO is the only way in — there is no password form, no second
 * provider, nothing to choose. A card whose single button says "Login dengan
 * Ventera SSO" is therefore one click that asks a question with one answer, so
 * we send the browser straight to the identity provider instead.
 *
 * The route itself stays: ProtectedRoute, the portal header and the landing
 * page all point here, and it is where SSO drops the user back on failure.
 *
 * Two cases must NOT auto-redirect:
 *   - `?error=sso_failed` — the callback bounced us here. Redirecting again
 *     would loop between GoStay and Ventera forever, so the failure is shown
 *     with a manual retry.
 *   - a live session — the user is already in; send them to their own home.
 */
export default function Login() {
  const { session, role, signIn, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const from = (location.state as { from?: string })?.from ?? "/";
  const failed = searchParams.get("error") === "sso_failed";

  // startLogin() navigates away, but React 18 StrictMode runs effects twice in
  // development — the guard keeps that from minting a second PKCE transaction
  // and overwriting the verifier of the one already in flight.
  const started = useRef(false);

  useEffect(() => {
    // Wait for the session to be read from storage; redirecting before that
    // would bounce an already-signed-in user out to Ventera and back.
    if (isLoading) return;

    if (session) {
      // Honour a real returnTo, otherwise their role's home rather than "/",
      // which is the marketing page.
      navigate(from !== "/" ? from : roleHome(role, session.tenant_id), { replace: true });
      return;
    }

    if (failed || started.current) return;
    started.current = true;
    signIn(from);
  }, [isLoading, session, failed]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm text-center"
      >
        <div className="w-24 h-24 mx-auto mb-3">
          <img src="/gostay.svg" alt="GoStay" className="w-full h-full object-contain" />
        </div>

        {failed ? (
          <>
            <p className="text-sm font-medium text-foreground mb-1">{tr("Login gagal")}</p>
            <p className="text-xs text-muted-foreground mb-5">
              {tr("Tidak dapat memverifikasi sesi SSO. Coba lagi.")}
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => signIn(from)}
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {tr("Coba lagi")}
            </motion.button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {tr("Mengalihkan ke Ventera SSO...")}
          </p>
        )}
      </motion.div>
    </div>
  );
}
