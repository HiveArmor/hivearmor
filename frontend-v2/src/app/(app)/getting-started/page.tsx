"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  FileSearch,
  Layers,
  Settings2,
  Shield,
  Sparkles,
  UserCog,
} from "lucide-react";
import {
  gettingStartedService,
  GettingStartedStep,
  GettingStartedStepEnum,
} from "@/services/getting-started.service";
import { ChecklistStep } from "@/components/getting-started/checklist-step";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/components/ui/toast";

// Step metadata: maps backend enum to display info
const STEP_META: Record<
  GettingStartedStepEnum,
  {
    icon: React.ReactNode;
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
  }
> = {
  SET_ADMIN_USER: {
    icon: <UserCog className="w-4 h-4" />,
    title: "Configure Admin User",
    description:
      "Set up your administrator account with a secure password and profile details to secure platform access.",
    actionLabel: "Go to Admin",
    actionHref: "/admin",
  },
  APPLICATION_SETTINGS: {
    icon: <Settings2 className="w-4 h-4" />,
    title: "Configure Application Settings",
    description:
      "Set your organization name, timezone, log retention, and SMTP for notifications.",
    actionLabel: "Open Settings",
    actionHref: "/settings",
  },
  DASHBOARD_BUILDER: {
    icon: <BarChart3 className="w-4 h-4" />,
    title: "Review Security Dashboards",
    description:
      "Explore pre-built SOC dashboards for threat hunting, compliance, and endpoint visibility.",
    actionLabel: "View Dashboards",
    actionHref: "/creator",
  },
  THREAT_MANAGEMENT: {
    icon: <Shield className="w-4 h-4" />,
    title: "Set Up Threat Management",
    description:
      "Create your first detection rule and configure alert triage workflows for your environment.",
    actionLabel: "Create Rule",
    actionHref: "/rules",
  },
  INTEGRATIONS: {
    icon: <Layers className="w-4 h-4" />,
    title: "Connect Integrations",
    description:
      "Add data sources and connect agents to start ingesting logs from endpoints, cloud, and network devices.",
    actionLabel: "Add Integration",
    actionHref: "/agents",
  },
};

export default function GettingStartedPage() {
  const router = useRouter();
  const { clearFirstLogin } = useAuthStore();
  const [steps, setSteps] = useState<GettingStartedStep[]>([]);
  const [loadingStep, setLoadingStep] = useState<GettingStartedStepEnum | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  const load = useCallback(async () => {
    const data = await gettingStartedService.getSteps();
    const sorted = [...data].sort((a, b) => a.stepOrder - b.stepOrder);
    setSteps(sorted);
    setPageLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const completedCount = steps.filter((s) => s.completed).length;
  const total = steps.length || 5;
  const allDone = total > 0 && completedCount === total;

  // Fire confetti when all steps become complete
  useEffect(() => {
    if (allDone) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [allDone]);

  async function handleComplete(step: GettingStartedStepEnum) {
    setLoadingStep(step);
    try {
      await gettingStartedService.completeStep(step);
      setSteps((prev) =>
        prev.map((s) => (s.stepShort === step ? { ...s, completed: true } : s))
      );
    } catch {
      toast("error", "Failed to mark step", "Please try again.");
    } finally {
      setLoadingStep(null);
    }
  }

  async function handleSkip(step: GettingStartedStepEnum) {
    await handleComplete(step);
  }

  function handleFinish() {
    clearFirstLogin();
    router.push("/alerts");
  }

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-4 relative">
      {/* CSS-only confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden>
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="confetti-particle absolute rounded-sm"
              style={{
                left: `${(i * 2.5) % 100}%`,
                top: "-10px",
                width: `${6 + (i % 5)}px`,
                height: `${8 + (i % 4)}px`,
                background: [
                  "var(--brand-primary)",
                  "#22c55e",
                  "#f59e0b",
                  "#3b82f6",
                  "#ec4899",
                ][i % 5],
                animationDelay: `${(i * 80) % 1200}ms`,
                animationDuration: `${2400 + (i % 8) * 200}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-brand" />
            <h1 className="text-h2 text-primary font-semibold">Getting Started</h1>
          </div>
          <p className="text-small text-muted">
            Complete these steps to get HiveArmor fully configured for your organization.
          </p>
        </div>
        <button
          onClick={handleFinish}
          className="btn btn-secondary btn-sm flex-shrink-0 mt-1"
        >
          Skip Setup
        </button>
      </div>

      {/* Progress */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between text-small">
          <span className="text-secondary font-medium">
            {completedCount} of {total} steps complete
          </span>
          <span className="text-muted">{progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-tertiary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progressPct}%`,
              background: allDone
                ? "var(--color-success)"
                : "var(--brand-primary)",
            }}
          />
        </div>
        {allDone && (
          <div className="flex items-center gap-2 text-success text-small font-medium">
            <CheckCircle2 className="w-4 h-4" />
            All steps complete — your platform is ready!
          </div>
        )}
      </div>

      {/* Step cards */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const meta = STEP_META[step.stepShort];
          if (!meta) return null;
          return (
            <ChecklistStep
              key={step.id}
              stepNumber={idx + 1}
              total={total}
              icon={meta.icon}
              title={meta.title}
              description={meta.description}
              actionLabel={meta.actionLabel}
              actionHref={meta.actionHref}
              completed={step.completed}
              loading={loadingStep === step.stepShort}
              onComplete={() => handleComplete(step.stepShort)}
              onSkip={() => handleSkip(step.stepShort)}
            />
          );
        })}
      </div>

      {/* Completion CTA */}
      {allDone && (
        <div className="card border border-success/30 bg-success/5 p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-success" />
            </div>
          </div>
          <div>
            <h2 className="text-h3 text-primary font-semibold">Platform Ready</h2>
            <p className="text-small text-muted mt-1">
              HiveArmor is fully configured. Head to the alerts dashboard to start monitoring.
            </p>
          </div>
          <button onClick={handleFinish} className="btn btn-primary gap-2">
            <FileSearch className="w-4 h-4" />
            Go to Alerts Dashboard
          </button>
        </div>
      )}

      {/* Confetti keyframes injected as a style tag */}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
        .confetti-particle {
          animation: confetti-fall linear both;
        }
      `}</style>
    </div>
  );
}
