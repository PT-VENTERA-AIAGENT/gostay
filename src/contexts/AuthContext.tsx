import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { getSession, logout, startLogin, type SsoClaims, type SsoSession } from "@/lib/sso";
import type { UserRole } from "@/types/database.types";

/**
 * The SSO subject claim is named `sub`, but callers throughout the app expect
 * `id`. Exposing both from one place keeps every call site working without
 * each one having to remember the mapping.
 */
export interface AuthUser extends SsoClaims {
  id: string;
}

interface AuthContextValue {
  session: SsoSession | null;
  user: AuthUser | null;
  role: UserRole | null;
  isLoading: boolean;
  signIn: (returnTo?: string) => void;
  signOut: () => void;
  refreshSession: () => void;
  // Legacy compat stubs (pages that call these will degrade gracefully)
  signUp: () => Promise<{ error: Error | null }>;
  resetPassword: () => Promise<{ error: Error | null }>;
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
function resolveRole(session: SsoSession): UserRole | null {
  return session.role ?? null;
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

  const signIn = (returnTo = "/") => startLogin(returnTo);
  const signOut = () => logout();

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session ? { ...session.claims, id: session.claims.sub } : null,
        role: session ? resolveRole(session) : null,
        isLoading,
        signIn,
        signOut,
        refreshSession,
        signUp: async () => ({ error: new Error("Use SSO login") }),
        resetPassword: async () => ({ error: new Error("Use SSO login") }),
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
