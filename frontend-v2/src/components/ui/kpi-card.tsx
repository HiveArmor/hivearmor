"use client";

import { cn, formatNumber } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { DeltaBadge } from "./delta-badge";
import { SkeletonCard } from "./skeleton";
import Link from "next/link";

interface KpiCardProps {
  label: string;
  value: number | string;
  delta?: number;
  invertDelta?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  href?: string;
  loading?: boolean;
  accentColor?: string;
  suffix?: string;
  subtitle?: string;
  className?: string;
}

export function KpiCard({
  label, value, delta, invertDelta = false,
  sparkData, sparkColor, icon,
  href, loading, accentColor, suffix, subtitle, className,
}: KpiCardProps) {
  if (loading) return <SkeletonCard className={className} />;

  const content = (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border",
        "transition-all duration-200",
        href && "cursor-pointer",
        className,
      )}
      style={{
        background: "var(--surface-primary)",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      {/* Accent top stripe */}
      {accentColor && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg"
          style={{ background: accentColor }}
        />
      )}

      {/* Glow layer on hover (via accent) */}
      {accentColor && href && (
        <div
          className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-lg pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top, ${accentColor}08 0%, transparent 70%)` }}
        />
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-tiny font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
          >
            {label}
          </span>
          {icon && (
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{
                background: accentColor ? `${accentColor}15` : "var(--surface-tertiary)",
                color: accentColor || "var(--text-muted)",
              }}
            >
              {icon}
            </div>
          )}
        </div>

        {/* Value row */}
        <div className="flex items-end gap-2 mt-0.5">
          <span
            className="kpi-xl leading-none tabular-nums"
            style={{ color: accentColor || "var(--text-primary)" }}
          >
            {typeof value === "number" ? formatNumber(value) : value}
            {suffix && (
              <span
                className="text-small font-normal ml-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                {suffix}
              </span>
            )}
          </span>
          {delta !== undefined && (
            <DeltaBadge value={delta} inverted={invertDelta} className="mb-1" />
          )}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-tiny" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
        )}

        {/* Sparkline — fills remaining vertical space */}
        {sparkData && sparkData.length > 0 && (
          <div className="mt-auto pt-2">
            <Sparkline
              data={sparkData}
              color={sparkColor || accentColor || "var(--brand-primary)"}
              height={32}
              filled
            />
          </div>
        )}
      </div>
    </div>
  );

  if (href) return <Link href={href} className="block group">{content}</Link>;
  return content;
}
