import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleCallback, getSession } from "@/lib/sso";
import { useSsoAuth, roleHome } from "@/contexts/AuthContext";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshSession } = useSsoAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error || !code || !state) {
      navigate("/login?error=sso_failed", { replace: true });
      return;
    }

    handleCallback(code, state).then((result) => {
      if (!result) {
        navigate("/login?error=sso_failed", { replace: true });
        return;
      }
      refreshSession();
      // handleCallback has just stored the session, role included, so read it
      // back for the routing decision. A returnTo that points at a real page
      // (a deep link the user was sent to /login from) wins; the default "/"
      // is marketing, so fall through to the role's home instead.
      const role = getSession()?.role ?? null;
      const dest =
        result.returnTo && result.returnTo !== "/" ? result.returnTo : roleHome(role);
      navigate(dest, { replace: true });
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Memverifikasi sesi…</p>
      </div>
    </div>
  );
}
