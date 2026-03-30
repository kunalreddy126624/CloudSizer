"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import { getCurrentUser, loginUser, logoutUser } from "@/lib/api";
import type { AuthenticatedUser } from "@/lib/types";

const LOCAL_TOKEN_KEY = "cloudsizer.auth_token";
const SESSION_TOKEN_KEY = "cloudsizer.auth_token_session";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  isAuthenticated: boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
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
      try {
        const currentUser = await getCurrentUser();
        if (active) {
          setUser(currentUser);
        }
      } catch {
        clearToken();
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
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
      loading,
      isAuthenticated: Boolean(user),
      async login(email: string, password: string, rememberMe: boolean) {
        const response = await loginUser({
          email,
          password,
          remember_me: rememberMe
        });
        persistToken(response.access_token, rememberMe);
        setUser(response.user);
      },
      async logout() {
        try {
          await logoutUser();
        } finally {
          clearToken();
          setUser(null);
        }
      }
    }),
    [loading, user]
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
