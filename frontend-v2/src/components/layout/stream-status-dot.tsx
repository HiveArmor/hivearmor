"use client";

import { cn } from "@/lib/utils";
import { useAlertStreamStore } from "@/store/alert-stream";

// Shows a combined connection health indicator for both SSE streams.
// Green = both connected, amber = one reconnecting, red = error/neither connected.
export function StreamStatusDot() {
  const alertStatus = useAlertStreamStore((s) => s.alertStreamStatus);
  const epsStatus = useAlertStreamStore((s) => s.epsStreamStatus);

  const allConnected = alertStatus === "connected" && epsStatus === "connected";
  const anyError = alertStatus === "error" || epsStatus === "error";
  const anyReconnecting = alertStatus === "reconnecting" || epsStatus === "reconnecting";

  const color = allConnected
    ? "bg-[var(--color-success)]"
    : anyError
      ? "bg-[var(--color-critical)]"
      : "bg-[var(--color-degraded)]";

  const title = allConnected
    ? "Live streams connected"
    : anyError
      ? "Stream connection error"
      : anyReconnecting
        ? "Reconnecting to live streams…"
        : "Connecting to live streams…";

  return (
    <div
      title={title}
      className="flex items-center gap-1.5 px-1.5 cursor-default select-none"
    >
      <span className={cn(
        "w-2 h-2 rounded-full shrink-0",
        color,
        (allConnected || anyReconnecting) && "animate-pulse",
      )} />
      <span className="text-micro text-muted hidden sm:inline">
        {allConnected ? "Live" : anyReconnecting ? "Reconnecting" : "Connecting"}
      </span>
    </div>
  );
}
