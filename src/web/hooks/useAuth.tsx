import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, SessionUser } from "@shared/schemas";
import { ApiError, api } from "@web/api/client";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  is: (role: Role) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: SessionUser }>("/auth/me")
      .then((r) => {
        if (!cancelled) setUser(r.user);
      })
      .catch((err: unknown) => {
        // A 401 here is the normal signed-out case, not a failure.
        if (!(err instanceof ApiError) || err.status !== 401) {
          console.error("Session check failed", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, pin: string) => {
    const r = await api.post<{ user: SessionUser }>("/auth/login", {
      username,
      pin,
    });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      is: (role) => user?.role === role,
    }),
    [user, loading, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
