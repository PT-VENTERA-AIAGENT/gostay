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

interface AuthContextValue {
  session: SsoSession | null;
  user: SsoClaims | null;
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

function realmToRole(realm?: string): UserRole {
  if (realm === "ventera-employees") return "admin";
  return "staff";
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
        user: session?.claims ?? null,
        role: session ? realmToRole(session.claims.realm) : null,
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
