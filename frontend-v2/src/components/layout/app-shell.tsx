"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar, useSidebarStore } from "./sidebar";
import { TopBar } from "./topbar";
import { StatusBar } from "./status-bar";
import { ToastContainer } from "@/components/ui/toast";
import { useThemeStore } from "@/store/theme";
import { useAuthStore } from "@/store/auth";
import { gettingStartedService } from "@/services/getting-started.service";
import { useAlertStream } from "@/hooks/use-alert-stream";
import { useEpsStream } from "@/hooks/use-eps-stream";
import { Shield } from "lucide-react";
import { AiAssistantDrawer } from "./ai-assistant-drawer";
import { canAccessRoute } from "@/lib/route-permissions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebarStore();
  const { theme, setTheme } = useThemeStore();
  const { checkAuth, isAuthenticated, isLoading, firstLogin, clearFirstLogin, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  // Start global SSE streams once the user is authenticated
  useAlertStream(isAuthenticated);
  useEpsStream(isAuthenticated);

  useEffect(() => {
    const saved = localStorage.getItem("hivearmor_theme") as "dark" | "light" | null;
    setTheme(saved || "dark");
  }, [setTheme]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }, [theme]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Role-based route guard: redirect to /403 when the user lacks the required role
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && pathname) {
      const userRoles = user.authorities || [];
      if (!canAccessRoute(pathname, userRoles)) {
        router.replace("/403");
      }
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

  // On first login, redirect to the getting-started wizard if any steps are incomplete
  useEffect(() => {
    if (!isLoading && isAuthenticated && firstLogin) {
      gettingStartedService.getSteps().then((steps) => {
        const incomplete = steps.some((s) => !s.completed);
        if (incomplete) {
          router.replace("/getting-started");
        } else {
          clearFirstLogin();
        }
      });
    }
  }, [isLoading, isAuthenticated, firstLogin, router, clearFirstLogin]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-ground">
        <div className="flex flex-col items-center gap-4">
          {/* Animated HiveArmor logo */}
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--brand-primary)" }}>
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-brand animate-ping opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-small font-semibold text-primary">HiveArmor</p>
            <p className="text-tiny text-muted">Initializing security platform...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-surface-ground">
      {/* 32px status bar at very top */}
      <StatusBar />

      {/* Sidebar starts below status bar (top-8 = 32px) */}
      <Sidebar />

      {/* Topbar starts below status bar (top-8) and right of sidebar */}
      <TopBar />

      {/* Main content: top = statusbar(32) + topbar(48) = 80px, left = sidebar */}
      <main
        className={cn(
          "min-h-screen transition-all duration-200 ease-smooth",
          "pt-[80px]",
          collapsed ? "pl-[64px]" : "pl-[260px]",
        )}
      >
        <div className="p-6 min-h-[calc(100vh-80px)]">
          {children}
        </div>
      </main>

      <ToastContainer />
      <AiAssistantDrawer />
    </div>
  );
}
