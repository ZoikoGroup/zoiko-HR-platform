import { useAuth } from "../context/AuthContext";

export default function RoleGuard({ roles, children }) {
  const { hasRole } = useAuth();

  if (!Array.isArray(roles) || roles.length === 0) return children;
  if (!hasRole(roles)) return null;
  return children;
}

