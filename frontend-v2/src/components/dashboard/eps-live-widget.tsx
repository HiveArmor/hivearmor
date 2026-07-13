"use client";

import { cn } from "@/lib/utils";
import { Zap } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { useAlertStreamStore } from "@/store/alert-stream";

interface EpsLiveWidgetProps {
  className?: string;
}

export function EpsLiveWidget({ className }: EpsLiveWidgetProps) {
  const eps = useAlertStreamStore((s) => s.eps);
  const history = useAlertStreamStore((s) => s.epsHistory);
  const status = useAlertStreamStore((s) => s.epsStreamStatus);

  const connected = status === "connected";
  const epsColor =
    eps > 500 ? "var(--brand-primary)" :
    eps > 0   ? "var(--color-high)"    :
    "var(--text-muted)";

  return (
    <div
      className={cn("relative flex flex-col overflow-hidden rounded-lg border", className)}
      style={{
        background: "var(--surface-primary)",
        borderColor: "rgba(255,255,255,0.07)",
        borderTop: `2px solid ${epsColor}`,
      }}
    >
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between">
          <span
            className="text-tiny font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
          >
            Live EPS
          </span>
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ background: `${epsColor}18`, color: epsColor }}
          >
            <Zap
              className={cn("w-4 h-4", connected && "animate-pulse")}
            />
          </div>
        </div>

        {/* Value */}
        <div className="flex items-end gap-2 mt-0.5">
          <span
            className="kpi-xl leading-none tabular-nums"
            style={{ color: epsColor }}
          >
            {eps.toLocaleString()}
          </span>
          <span
            className="text-small font-normal mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            eps
          </span>
        </div>

        {/* Status */}
        <p className="text-tiny" style={{ color: "var(--text-muted)" }}>
          {connected
            ? "Live stream connected"
            : status === "reconnecting"
            ? "Reconnecting…"
            : "Connecting…"}
        </p>

        {/* Sparkline */}
        <div className="mt-auto pt-2">
          <Sparkline
            data={history.length > 1 ? history : [0, eps]}
            color={epsColor}
            height={32}
            filled
          />
        </div>
      </div>
    </div>
  );
}
