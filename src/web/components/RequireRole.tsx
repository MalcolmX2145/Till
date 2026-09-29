import { Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "@shared/schemas";
import { useAuth } from "@web/hooks/useAuth";
import { FullPageSpinner } from "./FullPageSpinner";

/** Route guard. Omit `role` to require only that someone is signed in. */
export function RequireRole({ role }: { role?: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) {
    // A cashier landing on an admin URL goes to the screen they can use.
    return <Navigate to="/sell" replace />;
  }
  return <Outlet />;
}
