import { Navigate, useLocation } from "react-router-dom";
import { roleHome, useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types/database.types";

interface Props {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { session, role, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Deny by default. The previous `role && !allowedRoles.includes(role)` let a
  // session with no resolved role through every check, because a null role made
  // the condition short-circuit to false.
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    // Send guests somewhere useful rather than bouncing them to the landing page.
    return <Navigate to={roleHome(role, session.tenant_id)} replace />;
  }

  return <>{children}</>;
}
