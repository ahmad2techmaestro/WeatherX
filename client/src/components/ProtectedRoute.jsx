import { Navigate, Outlet, useLocation } from "react-router-dom";

import Logo from "./ui/Logo";
import { useAuth } from "../context/AuthContext";

/** Every page except sign in and sign up lives behind this gate. */
export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <Logo size={44} />
        <span className="splash__bar" aria-hidden="true" />
        <span className="sr-only">Restoring your session</span>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  return <Outlet />;
}
