"use client";
import React, {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOKEN_KEY = "kabadiai_token";

export interface KUser {
  id: string;
  email: string;
  name: string;
  avatar: string;
  provider: string;
  created_at: string;
}

interface AuthCtx {
  user: KUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

/** Thin wrapper around fetch that always injects the Bearer token. */
function makeAuthFetch(token: string | null) {
  return (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API}${path}`, { ...init, headers });
  };
}

async function apiFetch(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<{ token: string; user: KUser }> {
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<KUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((t: string, u: KUser) => {
    setToken(t);
    setUser(u);
    try { localStorage.setItem(TOKEN_KEY, t); } catch {}
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  }, []);

  // Rehydrate on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) { setLoading(false); return; }
    // Quick decode (no verify — server will reject if expired)
    try {
      const payload = JSON.parse(atob(stored.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp * 1000 < Date.now()) { logout(); setLoading(false); return; }
    } catch { logout(); setLoading(false); return; }

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => persist(stored, d.user))
      .catch(logout)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const d = await apiFetch("/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }, null);
    persist(d.token, d.user);
  }, [persist]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const d = await apiFetch("/auth/register", {
      method: "POST", body: JSON.stringify({ name, email, password }),
    }, null);
    persist(d.token, d.user);
  }, [persist]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const d = await apiFetch("/auth/google", {
      method: "POST", body: JSON.stringify({ credential }),
    }, null);
    persist(d.token, d.user);
  }, [persist]);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) => makeAuthFetch(token)(path, init),
    [token],
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithGoogle, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
