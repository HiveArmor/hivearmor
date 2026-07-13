"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.ok && result.tfa) {
      router.push("/login/tfa");
      return;
    }
    if (result.ok) {
      router.replace("/dashboard");
      return;
    }
    setError(result.error || "Invalid credentials. Please try again.");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: "var(--surface-ground)" }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow behind card */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="relative w-full max-w-[380px]">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8 text-center">
          {/* Logo mark */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "var(--brand-primary)",
              boxShadow: "0 0 32px rgba(59,130,246,0.45), 0 4px 16px rgba(0,0,0,0.4)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L3 6.5V12C3 16.5 7 20.5 12 22C17 20.5 21 16.5 21 12V6.5L12 2Z"
                fill="white"
                fillOpacity="0.95"
              />
              <path
                d="M9 12L11 14L15 10"
                stroke="#0D1221"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            className="font-extrabold"
            style={{ fontSize: "1.6rem", letterSpacing: "-0.025em", color: "var(--text-primary)" }}
          >
            HiveArmor
          </h1>
          <p
            className="mt-1 font-semibold uppercase tracking-widest"
            style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.18em" }}
          >
            Security Intelligence Platform
          </p>
        </div>

        {/* Login card */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: "var(--surface-primary)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.50), 0 0 0 1px rgba(59,130,246,0.06)",
          }}
        >
          {/* Card top accent */}
          <div
            className="h-[2px]"
            style={{ background: "var(--brand-primary)" }}
          />

          <div className="p-7 space-y-5">
            <p
              className="text-small font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign in to your console
            </p>

            {error && (
              <div
                className="px-3 py-2.5 rounded-lg text-small"
                style={{
                  background: "var(--color-critical-subtle)",
                  border: "1px solid rgba(242,53,53,0.30)",
                  color: "var(--color-critical)",
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="text-tiny font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em" }}
                >
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-base w-full"
                  placeholder="admin"
                  autoFocus
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-tiny font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)", fontSize: "10px", letterSpacing: "0.08em" }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-base w-full pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4" />
                      : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="btn-primary w-full mt-2 h-10"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : "Sign In"
                }
              </button>
            </form>
          </div>
        </div>

        <p
          className="text-center mt-6 text-micro"
          style={{ color: "var(--text-muted)", letterSpacing: "0.04em" }}
        >
          HiveArmor — Hyper-scale Incident Visibility Engine
        </p>
      </div>
    </div>
  );
}
