import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { getToken } from "../lib/api";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = getToken();
  const location = useLocation();
  if (!token) {
    // Remember where the user was headed (e.g. a scanned /join/CODE link) so
    // Login can send them straight back after signing in.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
