import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { apiUrl } from "./api";

const TOKEN_KEY = "auth_token";

export type User = { userId: string; email: string; name: string };

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
  logout: () => Promise<void>;
  authFetch: (path: string, opts?: RequestInit) => Promise<Response>;
  applyAuth: (token: string, user: User) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!saved) return;
        const res = await fetch(apiUrl("/api/auth/me"), {
          headers: { Authorization: `Bearer ${saved}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setToken(saved);
            setUser(data.user as User);
            return;
          }
        }
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } catch {
        // network error on cold start — leave unauthenticated
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveAuth = useCallback(async (t: string, u: User) => {
    await SecureStore.setItemAsync(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new AuthApiError(
          data.error ?? `Login failed (${res.status})`,
          (data.code as LoginErrorCode) ?? "UNKNOWN",
          data.email
        );
      }
      await saveAuth(data.token, {
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
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error ?? `Registration failed (${res.status})`);

      if (data.needsVerification) {
        return {
          kind: "needsVerification",
          email: data.email,
          message: data.message,
        };
      }

      const u: User = {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      };
      await saveAuth(data.token, u);
      return { kind: "verified", user: u };
    },
    [saveAuth]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const authFetch = useCallback(
    (path: string, opts: RequestInit = {}) => {
      const headers = new Headers(opts.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(apiUrl(path), { ...opts, headers });
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout, authFetch, applyAuth: saveAuth }}
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
