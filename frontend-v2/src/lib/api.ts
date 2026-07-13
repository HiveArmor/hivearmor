// Use relative URLs in browser (proxied by Next.js rewrites to NEXT_PUBLIC_API_URL).
// Fall back to absolute URL for SSR where rewrites don't apply.
const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8089");

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("hivearmor_auth_token", token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("hivearmor_auth_token");
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("hivearmor_auth_token");
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {} } = options;

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    const token = this.getToken();
    // Never send a stale token on the authenticate endpoint itself —
    // an invalid JWT in the header causes Spring Security to reject the request
    // before it ever processes the credentials.
    const isAuthEndpoint = path === "/api/authenticate";
    if (token && !isAuthEndpoint) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      const hadToken = !!this.token;
      this.clearToken();
      // Only redirect to login when a session was active (token expired/revoked).
      // During a login attempt there is no token yet — let the caller handle the 401.
      if (hadToken && typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      // Spring Boot puts the error detail in X-app-error header when body is empty
      const appError = res.headers.get("X-app-error");
      const error = await res.json().catch(() => ({ message: appError || res.statusText }));
      throw new Error(error.detail || error.message || appError || "Request failed");
    }

    // Handle empty responses
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  async getWithHeaders<T>(path: string): Promise<{ data: T; headers: Headers }> {
    const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { headers: reqHeaders });
    if (res.status === 401) {
      const hadToken = !!this.token;
      this.clearToken();
      if (hadToken && typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      // Spring Boot puts the error detail in X-app-error header when body is empty
      const appError = res.headers.get("X-app-error");
      const error = await res.json().catch(() => ({ message: appError || res.statusText }));
      throw new Error(error.detail || error.message || appError || "Request failed");
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) as T : {} as T;
    return { data, headers: res.headers };
  }

  post<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "POST", body });
  }

  put<T>(path: string, body: unknown) {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
