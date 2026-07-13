"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import { cn, formatNumber } from "@/lib/utils";
import Link from "next/link";

interface AlertSeverityDonutProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
  loading?: boolean;
  className?: string;
}

const SEV_ROWS = [
  { label: "Critical", key: "critical" as const, color: "var(--color-critical)", href: "/alerts?severity=critical", pct: (v: number, t: number) => t > 0 ? Math.round(v / t * 100) : 0 },
  { label: "High",     key: "high"     as const, color: "var(--color-high)",     href: "/alerts?severity=high"     , pct: (v: number, t: number) => t > 0 ? Math.round(v / t * 100) : 0 },
  { label: "Medium",   key: "medium"   as const, color: "var(--color-medium)",   href: "/alerts?severity=medium"  , pct: (v: number, t: number) => t > 0 ? Math.round(v / t * 100) : 0 },
  { label: "Low",      key: "low"      as const, color: "var(--color-low)",      href: "/alerts?severity=low"     , pct: (v: number, t: number) => t > 0 ? Math.round(v / t * 100) : 0 },
];

export function AlertSeverityDonut({ critical, high, medium, low, loading, className }: AlertSeverityDonutProps) {
  const total = critical + high + medium + low;
  const values = { critical, high, medium, low };

  const option = useMemo(() => ({
    animation: true,
    animationDuration: 800,
    animationEasing: "cubicOut",
    tooltip: {
      trigger: "item",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (p: any) =>
        `<div style="font-size:12px;line-height:1.8">` +
        `<span style="color:${p.color};font-weight:700">${p.name}</span><br/>` +
        `<span style="color:#8B9BB5">${p.value.toLocaleString()} alerts (${p.percent}%)</span>` +
        `</div>`,
      backgroundColor: "#0D1221",
      borderColor: "rgba(255,255,255,0.10)",
      borderWidth: 1,
      textStyle: { color: "#EEF2FF" },
      extraCssText: "border-radius:8px;padding:8px 12px;",
    },
    series: [{
      type: "pie",
      radius: ["62%", "88%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: false,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderWidth: 3, borderColor: "#07091A" },
      data: [
        { value: critical, name: "Critical", itemStyle: { color: "#F23535" } },
        { value: high,     name: "High",     itemStyle: { color: "#F59E0B" } },
        { value: medium,   name: "Medium",   itemStyle: { color: "#FBBF24" } },
        { value: low,      name: "Low",      itemStyle: { color: "#22D3EE" } },
      ].filter(d => d.value > 0),
      emphasis: {
        scaleSize: 5,
        itemStyle: {
          shadowBlur: 20,
          shadowOffsetX: 0,
          shadowColor: "rgba(0,0,0,0.6)",
        },
      },
    }],
  }), [critical, high, medium, low]);

  if (loading) {
    return (
      <div className={cn("card p-5 flex flex-col gap-4", className)}>
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 rounded-full shimmer shrink-0" />
          <div className="space-y-2.5 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full shimmer shrink-0" />
                <div className="h-3.5 flex-1 shimmer rounded" />
                <div className="h-3.5 w-8 shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("card flex flex-col", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <span
          className="text-tiny font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
        >
          Severity Distribution
        </span>
        {critical > 0 && (
          <span className="count-badge-critical">
            <span
              className="w-1.5 h-1.5 rounded-full animate-data-pulse"
              style={{ background: "var(--color-critical)" }}
            />
            {critical} CRITICAL
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center p-4 gap-4">
        {/* Donut + center label */}
        <div className="relative mx-auto" style={{ width: 140, height: 140 }}>
          <ReactECharts
            option={option}
            style={{ width: 140, height: 140 }}
            opts={{ renderer: "canvas" }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
            <span
              className="font-bold tabular-nums leading-none"
              style={{ fontSize: "1.75rem", color: "var(--text-primary)", letterSpacing: "-0.03em" }}
            >
              {formatNumber(total)}
            </span>
            <span
              className="text-micro font-semibold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", fontSize: "9px" }}
            >
              ALERTS
            </span>
          </div>
        </div>

        {/* Legend rows */}
        <div className="space-y-2">
          {SEV_ROWS.map(row => {
            const count = values[row.key];
            const pct = row.pct(count, total);
            return (
              <Link
                key={row.label}
                href={row.href}
                className="flex items-center gap-2.5 group hover:opacity-80 transition-opacity"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: row.color, boxShadow: `0 0 5px ${row.color}60` }}
                />
                <span className="text-tiny flex-1" style={{ color: "var(--text-secondary)" }}>
                  {row.label}
                </span>
                <span
                  className="text-tiny font-bold tabular-nums"
                  style={{ color: row.color }}
                >
                  {count.toLocaleString()}
                </span>
                <span
                  className="text-micro font-medium tabular-nums w-10 text-right"
                  style={{ color: "var(--text-muted)" }}
                >
                  ({pct}%)
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
