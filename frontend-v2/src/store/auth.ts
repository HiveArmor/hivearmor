import { create } from "zustand";
import { api } from "@/lib/api";

export interface User {
  login: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  authorities: string[];
}

interface LoginResponse {
  token: string;
  success: boolean;
  tfaConfigured: boolean;
  forceTfa: boolean;
  method: string | null;
  tfaExpiresInSeconds: number;
  firstLogin: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tfaPending: boolean;
  firstLogin: boolean;
  clearFirstLogin: () => void;
  login: (username: string, password: string) => Promise<{ ok: boolean; tfa: boolean; error?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!api.getToken(),
  isLoading: true,
  tfaPending: false,
  firstLogin: typeof window !== "undefined"
    ? sessionStorage.getItem("hivearmor_first_login") === "1"
    : false,

  clearFirstLogin: () => {
    if (typeof window !== "undefined") sessionStorage.removeItem("hivearmor_first_login");
    set({ firstLogin: false });
  },

  login: async (username: string, password: string) => {
    try {
      const res = await api.post<LoginResponse>(
        "/api/authenticate",
        { username, password, rememberMe: false },
      );

      if (!res.token) {
        return { ok: false, tfa: false, error: "Invalid credentials. Please try again." };
      }

      api.setToken(res.token);

      // If TFA is configured, token is a limited challenge token — don't mark authenticated yet
      if (res.tfaConfigured) {
        set({ tfaPending: true });
        return { ok: true, tfa: true };
      }

      // Normal login: fetch full user account
      const user = await api.get<User>("/api/account");
      if (res.firstLogin && typeof window !== "undefined") {
        sessionStorage.setItem("hivearmor_first_login", "1");
      }
      set({ user, isAuthenticated: true, isLoading: false, tfaPending: false, firstLogin: !!res.firstLogin });
      return { ok: true, tfa: false };
    } catch (err: unknown) {
      api.clearToken();
      const raw = err instanceof Error ? err.message : "";
      const message = raw === "Unauthorized"
        ? "Invalid credentials. Please try again."
        : raw || "Login failed. Please try again.";
      return { ok: false, tfa: false, error: message };
    }
  },

  logout: () => {
    api.clearToken();
    set({ user: null, isAuthenticated: false, tfaPending: false });
  },

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const user = await api.get<User>("/api/account");
      if (!user || !(user as User).login) {
        api.clearToken();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.clearToken();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
