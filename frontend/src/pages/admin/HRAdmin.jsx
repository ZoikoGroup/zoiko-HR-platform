import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";

export default function HRAdmin() {
  const { role, defaultRedirect } = useAuth();

  if (role === "hr_admin") {
    return <Navigate to="/zoiko-hr" replace />;
  }

  return <Navigate to={defaultRedirect} replace />;
}
