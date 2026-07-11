import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleCallback } from "@/lib/sso";
import { useSsoAuth } from "@/contexts/AuthContext";

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
      navigate(result.returnTo || "/", { replace: true });
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
