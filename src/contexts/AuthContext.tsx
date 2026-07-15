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

function parseRealms(raw: string | undefined, fallback: string[]): string[] {
  const parsed = (raw ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

const ADMIN_REALMS = parseRealms(import.meta.env.VITE_SSO_ADMIN_REALMS, ["ventera-employees"]);
const STAFF_REALMS = parseRealms(import.meta.env.VITE_SSO_STAFF_REALMS, []);

/**
 * Maps an SSO realm to an application role, denying by default.
 *
 * Anyone who authenticates against the issuer lands here, including guests —
 * the portal's own "Sign In" points at the same /login. So an unrecognised or
 * absent realm must resolve to the *least* privileged role, never to `staff`.
 *
 * Only a fallback: when the server has provisioned a profile it returns the
 * stored role on the session, and that is what the database enforces. This runs
 * when Supabase is not configured, or before a profile exists.
 */
function realmToRole(realm?: string): UserRole {
  if (!realm) return "customer";
  if (ADMIN_REALMS.includes(realm)) return "admin";
  if (STAFF_REALMS.includes(realm)) return "staff";
  return "customer";
}

/**
 * The role to show in the UI. Prefers the role the server read back from
 * profiles, because that is the one RLS applies — an admin may have changed it
 * since the user's realm was assigned.
 *
 * Neither source is a security boundary: this value only decides what the
 * browser renders, and the session it comes from is editable. Enforcement lives
 * in the RLS policies keyed on auth.uid().
 */
function resolveRole(session: SsoSession): UserRole {
  return session.role ?? realmToRole(session.claims.realm);
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
