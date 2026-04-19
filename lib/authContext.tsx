"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type User = {
  userId: string;
  email: string;
  name: string;
};

export type LoginErrorCode = "EMAIL_NOT_VERIFIED" | "UNKNOWN";

export class AuthApiError extends Error {
  code: LoginErrorCode;
  email?: string;
  constructor(message: string, code: LoginErrorCode = "UNKNOWN", email?: string) {
    super(message);
    this.code = code;
    this.email = email;
  }
}

export type RegisterResult =
  | { kind: "verified"; user: User }
  | { kind: "needsVerification"; email: string; message: string };

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<RegisterResult>;
  logout: () => void;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  applyExistingToken: (token: string, user: User) => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) {
      setToken(saved);
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${saved}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.user) setUser(d.user);
          else {
            localStorage.removeItem("auth_token");
            setToken(null);
          }
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const saveAuth = useCallback((t: string, u: User) => {
    localStorage.setItem("auth_token", t);
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new AuthApiError(
          data.error ?? "Login failed",
          (data.code as LoginErrorCode) ?? "UNKNOWN",
          data.email
        );
      }
      saveAuth(data.token, {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
    },
    [saveAuth]
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string
    ): Promise<RegisterResult> => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");

      if (data.needsVerification) {
        return {
          kind: "needsVerification",
          email: data.email,
          message: data.message,
        };
      }

      saveAuth(data.token, {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
      return {
        kind: "verified",
        user: {
          userId: data.user.id,
          email: data.user.email,
          name: data.user.name,
        },
      };
    },
    [saveAuth]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  }, []);

  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) => {
      const headers = new Headers(opts.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(url, { ...opts, headers });
    },
    [token]
  );

  const applyExistingToken = useCallback(
    (t: string, u: User) => {
      saveAuth(t, u);
    },
    [saveAuth]
  );

  const refreshUser = useCallback(async () => {
    const t = token ?? localStorage.getItem("auth_token");
    if (!t) return;
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.user) setUser(data.user);
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        authFetch,
        applyExistingToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
