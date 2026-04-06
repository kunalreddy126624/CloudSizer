"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import { getRbacPrincipal, loginRbacUser, logoutUser } from "@/lib/api";
import type { AuthenticatedUser, PermissionName, RbacAuthenticatedUser, RbacPrincipal, RoleName } from "@/lib/types";

const LOCAL_TOKEN_KEY = "cloudsizer.auth_token";
const SESSION_TOKEN_KEY = "cloudsizer.auth_token_session";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  principal: RbacPrincipal | null;
  roles: RoleName[];
  permissions: PermissionName[];
  loading: boolean;
  isAuthenticated: boolean;
  isRbacSession: boolean;
  hasRole: (...roles: RoleName[]) => boolean;
  hasPermission: (...permissions: PermissionName[]) => boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistToken(token: string, rememberMe: boolean) {
  if (rememberMe) {
    window.localStorage.setItem(LOCAL_TOKEN_KEY, token);
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }

  window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  window.localStorage.removeItem(LOCAL_TOKEN_KEY);
}

function clearToken() {
  window.localStorage.removeItem(LOCAL_TOKEN_KEY);
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function buildFallbackUserFromPrincipal(principal: RbacPrincipal): AuthenticatedUser {
  return {
    id: principal.sub,
    email: principal.email,
    full_name: principal.email,
    created_at: new Date(0).toISOString()
  };
}

function buildPrincipalFromRbacUser(user: RbacAuthenticatedUser): RbacPrincipal {
  const permissions = Array.from(
    new Set(user.roles.flatMap((role) => role.permissions.map((permission) => permission.name)))
  );

  return {
    sub: user.id,
    email: user.email,
    roles: user.roles.map((role) => role.name),
    permissions
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [principal, setPrincipal] = useState<RbacPrincipal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token =
      window.localStorage.getItem(LOCAL_TOKEN_KEY) ?? window.sessionStorage.getItem(SESSION_TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    async function loadUser() {
      let currentPrincipal: RbacPrincipal | null = null;

      try {
        currentPrincipal = await getRbacPrincipal();
      } catch {
        currentPrincipal = null;
      }

      if (active) {
        if (currentPrincipal) {
          setPrincipal(currentPrincipal);
          setUser(buildFallbackUserFromPrincipal(currentPrincipal));
        } else {
          clearToken();
          setPrincipal(null);
          setUser(null);
        }
        setLoading(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      principal,
      roles: principal?.roles ?? [],
      permissions: principal?.permissions ?? [],
      loading,
      isAuthenticated: Boolean(user),
      isRbacSession: Boolean(principal),
      hasRole: (...roles: RoleName[]) => Boolean(principal && roles.some((role) => principal.roles.includes(role))),
      hasPermission: (...permissions: PermissionName[]) =>
        Boolean(principal && permissions.every((permission) => principal.permissions.includes(permission))),
      async login(email: string, password: string, rememberMe: boolean) {
        const response = await loginRbacUser({
          email,
          password,
          remember_me: rememberMe
        });
        persistToken(response.access_token, rememberMe);
        setPrincipal(buildPrincipalFromRbacUser(response.user));
        setUser({
          id: response.user.id,
          email: response.user.email,
          full_name: response.user.full_name,
          created_at: new Date(0).toISOString()
        });
      },
      async logout() {
        try {
          await logoutUser();
        } finally {
          clearToken();
          setPrincipal(null);
          setUser(null);
        }
      }
    }),
    [loading, principal, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
