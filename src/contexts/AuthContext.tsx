import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSession, logout, sessionExpiryMs, startLogin, type SsoClaims, type SsoSession } from "@/lib/sso";
import type { UserRole } from "@/types/database.types";

/**
 * Callers throughout the app expect `user.id`, and what they invariably mean by
 * it is `profiles.id` — every foreign key that records who did something
 * (chat_messages.sender_id, call_logs.agent_id, booking_audit_log.performed_by)
 * points at that table.
 *
 * So `id` is the profile uuid the server derived, **not** the raw SSO subject.
 * They are different values: profiles.id = uuid_v5(namespace, sub). Using `sub`
 * here would send an id no row has, and every such write would be rejected as a
 * foreign key violation.
 */
export interface AuthUser extends SsoClaims {
  id: string;
}

function toAuthUser(session: SsoSession): AuthUser {
  return {
    ...session.claims,
    // The fallback only bites when Supabase is unconfigured, in which case
    // there is no profiles row to point at and no write will succeed anyway.
    id: session.profile_id ?? session.claims.sub,
  };
}

interface AuthContextValue {
  session: SsoSession | null;
  user: AuthUser | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
  refreshSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * The role comes from `profiles.role` in the database, read back by
 * /api/sso/token and carried on the session. Nothing in the SSO token — realm
 * included — grants a role: the database is the only source of truth, which is
 * also what get_my_role() reads inside every RLS policy.
 *
 * Null when Supabase is not configured, or before a profile exists. Null denies
 * every gated route, which is the correct answer in both cases.
 *
 * This value is not a security boundary: it only decides what the browser
 * renders, and the session it comes from is editable. Enforcement lives in the
 * RLS policies keyed on auth.uid().
 */
const VALID_ROLES: UserRole[] = ["admin", "staff", "customer"];
function resolveRole(session: SsoSession): UserRole | null {
  // Defence in depth: getSession() already nulls unknown roles, but validate
  // here too so a role only ever gates the UI when it's one RLS recognises.
  const r = session.role;
  return r && VALID_ROLES.includes(r as UserRole) ? (r as UserRole) : null;
}

/**
 * Where a signed-in user belongs after login.
 *
 * Staff and admin run the back office at /dashboard; everyone else — customers,
 * and users whose role has not resolved yet — get the guest portal, which is
 * public and never bounces them. Sending a null-role user to /dashboard would
 * only get them denied by ProtectedRoute and dumped back here.
 *
 * The landing page at "/" is marketing, not an app home: routing a logged-in
 * user there leaves them staring at a "Masuk" button, which is exactly the
 * "kok cuma refresh" symptom.
 */
export function roleHome(role: UserRole | null): string {
  return role === "admin" || role === "staff" ? "/dashboard" : "/portal";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SsoSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = useCallback(() => {
    setSession(getSession());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // When the session ends, sign the user out instead of leaving a dead token in
  // place. A stale token doesn't error loudly — RLS just returns empty, so the
  // app looked "logged in" while every page silently went blank ("sesi habis
  // malah kosongin data"). Fire a timer at the exact expiry, and re-check when
  // the tab regains focus (the common case: left open past the token's life).
  useEffect(() => {
    if (!session) return;
    const expiresAt = sessionExpiryMs(session);
    const recheck = () => {
      // getSession() clears and returns null once expired; if it's gone, so is
      // the session — bounce to a clean logged-out state.
      if (!getSession()) logout();
    };
    const msLeft = Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647));
    const timer = window.setTimeout(logout, msLeft);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [session]);

  const signIn = (returnTo = "/") => startLogin(returnTo);
  const signOut = () => logout();

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session ? toAuthUser(session) : null,
        role: session ? resolveRole(session) : null,
        isLoading,
        signIn,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Named export for AuthCallback which needs refreshSession
export function useSsoAuth() {
  return useAuth();
}
