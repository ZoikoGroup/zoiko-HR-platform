import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  login as loginRequest,
  register as registerRequest,
  logout as logoutRequest,
  fetchCurrentUser,
  getCachedUser,
  isAuthenticated,
} from "../service/authService";

import {
  ROLES,
  ROLE_ALLOWED_PREFIXES,
  ROLE_DEFAULT_REDIRECT,
  VALID_ROLES,
  PRODUCT_ALLOWED_PREFIXES,
  PRODUCT_LANDING_ROUTES,
  PRODUCTS,
} from "../config/roles";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCachedUser());
  const [loading, setLoading] = useState(isAuthenticated());
  const [error, setError] = useState(null);


  useEffect(() => {
    let active = true;
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    setError(null);
    setLoading(true);
    try {
      const loggedInUser = await loginRequest(credentials);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (err) {
      setError(err.message || "Unable to sign in");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload) => {
    setError(null);
    setLoading(true);
    try {
      const result = await registerRequest(payload);
      // Registration returns no tokens (org is PENDING) — do NOT set user.
      // RegisterPage handles navigation to /login after showing success.
      return result;
    } catch (err) {
      setError(err.message || "Unable to create account");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const products = Array.isArray(user?.products) ? user.products : [];

  const product = (() => {
    if (products.length === 0) return PRODUCTS.ALL;
    if (products.length === 1) return products[0];
    return PRODUCTS.ALL;
  })();

  const canAccessProduct = (pathname) => {
    if (user?.role === ROLES.SUPER_ADMIN) return true;
    if (!products.length) return false;
    return products.some((code) => {
      const allowedPrefixes = PRODUCT_ALLOWED_PREFIXES[code];
      if (!allowedPrefixes) return false;
      return allowedPrefixes.some((prefix) => {
        if (prefix === "/") return pathname === "/";
        return pathname === prefix || pathname.startsWith(prefix);
      });
    });
  };

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const role = user?.role && VALID_ROLES.includes(user.role) ? user.role : null;

  const defaultRedirect = role ? ROLE_DEFAULT_REDIRECT[role] : "/dashboard";

  const getFirstAccessibleRoute = useCallback(() => {
    if (!role) return "/login";
    const rolePrefixes = ROLE_ALLOWED_PREFIXES[role] ?? [];

    const roleCanAccess = (pathname) =>
      rolePrefixes.some((rp) => {
        if (rp === "/") return pathname === "/";
        return pathname === rp || pathname.startsWith(rp.endsWith("/") ? rp : rp + "/");
      });

    const productCanAccess = (pathname) =>
      products.some((code) => {
        const allowedPrefixes = PRODUCT_ALLOWED_PREFIXES[code];
        if (!allowedPrefixes) return false;
        return allowedPrefixes.some((prefix) => {
          if (prefix === "/") return pathname === "/";
          return pathname === prefix || pathname.startsWith(prefix);
        });
      });

    if (products.length === 0 || (roleCanAccess(defaultRedirect) && productCanAccess(defaultRedirect))) {
      return defaultRedirect;
    }

    for (const code of products) {
      const landing = PRODUCT_LANDING_ROUTES[code];
      if (landing && roleCanAccess(landing) && productCanAccess(landing)) return landing;
    }

    for (const code of products) {
      const productPrefixes = PRODUCT_ALLOWED_PREFIXES[code];
      if (!productPrefixes) continue;
      for (const prefix of productPrefixes) {
        if (roleCanAccess(prefix)) return prefix;
      }
    }
    return ROLE_DEFAULT_REDIRECT[role] || "/login";
  }, [role, products, defaultRedirect]);

  const hasRole = (roles) => {
    if (!role) return false;
    if (!Array.isArray(roles)) {
      return role === roles;
    }
    return roles.includes(role);
  };

  const canAccess = (pathname) => {
    if (!role) return false;
    const prefixes = ROLE_ALLOWED_PREFIXES[role] ?? [];
    return prefixes.some((prefix) => {
      if (!pathname) return false;
      if (prefix === "/") return pathname === "/";
      return pathname === prefix || pathname.startsWith(prefix);
    });
  };

  const value = {
    user,
    role,
    product,
    products,
    isAuthenticated: Boolean(user) || isAuthenticated(),
    loading,
    error,
    login,
    register,
    logout,
    hasRole,
    canAccess,
    canAccessProduct,
    getFirstAccessibleRoute,
    defaultRedirect,
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
