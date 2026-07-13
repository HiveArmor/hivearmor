"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { AlertTimePoint } from "@/services/overview.service";
import { cn } from "@/lib/utils";

interface AlertTimelineHeatmapProps {
  data: AlertTimePoint[];
  loading?: boolean;
  className?: string;
}

const SEVERITY_ROWS = [
  { key: "critical" as const, label: "Critical", color: "#F23535" },
  { key: "high"     as const, label: "High",     color: "#F59E0B" },
  { key: "medium"   as const, label: "Medium",   color: "#FBBF24" },
  { key: "low"      as const, label: "Low",      color: "#22D3EE" },
];

export function AlertTimelineHeatmap({ data, loading, className }: AlertTimelineHeatmapProps) {
  const peakHour = useMemo(() => {
    if (!data.length) return null;
    let max = 0;
    let peak = 0;
    data.forEach((pt) => {
      const total = pt.critical + pt.high + pt.medium + pt.low;
      if (total > max) { max = total; peak = pt.hour; }
    });
    return max > 0 ? `Peak ${String(peak).padStart(2, "0")}:00–${String(peak + 2).padStart(2, "0")}:00` : null;
  }, [data]);

  const option = useMemo(() => {
    if (!data.length) return {};

    const hourLabels = Array.from({ length: 24 }, (_, i) =>
      `${String(i).padStart(2, "0")}:00`
    );

    const seriesData: [number, number, number][] = [];
    data.forEach((pt) => {
      SEVERITY_ROWS.forEach((sev, si) => {
        seriesData.push([pt.hour, si, pt[sev.key] || 0]);
      });
    });

    const maxVal = Math.max(...seriesData.map(d => d[2]), 1);

    return {
      animation: true,
      animationDuration: 700,
      backgroundColor: "transparent",
      tooltip: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const hour = hourLabels[params.data[0]];
          const sev  = SEVERITY_ROWS[params.data[1]].label;
          const cnt  = params.data[2];
          const color = SEVERITY_ROWS[params.data[1]].color;
          return (
            `<div style="font-size:12px;line-height:1.8;font-family:system-ui">` +
            `<span style="color:${color};font-weight:700">${sev}</span> · ${hour}<br/>` +
            `<span style="color:#8B9BB5">${cnt} alert${cnt !== 1 ? "s" : ""}</span>` +
            `</div>`
          );
        },
        backgroundColor: "#0D1221",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        textStyle: { color: "#EEF2FF" },
        extraCssText: "border-radius:8px;padding:8px 12px;",
      },
      grid: { top: 12, right: 12, bottom: 36, left: 70 },
      xAxis: {
        type: "category",
        data: hourLabels,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } },
        axisLabel: {
          color: "#4F6378",
          fontSize: 10,
          interval: 3,
          formatter: (val: string) => val.slice(0, 2),
        },
        axisTick: { show: false },
      },
      yAxis: {
        type: "category",
        data: SEVERITY_ROWS.map(s => s.label).reverse(),
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#8B9BB5",
          fontSize: 11,
          fontWeight: 600,
          formatter: (val: string) => `{${val.toLowerCase()}|${val}}`,
          rich: {
            critical: { color: "#F23535", fontSize: 11, fontWeight: 700 },
            high:     { color: "#F59E0B", fontSize: 11, fontWeight: 700 },
            medium:   { color: "#FBBF24", fontSize: 11, fontWeight: 700 },
            low:      { color: "#22D3EE", fontSize: 11, fontWeight: 700 },
          },
        },
      },
      visualMap: { min: 0, max: maxVal, show: false, inRange: { color: ["#0D1221"] } },
      series: SEVERITY_ROWS.map((sev, si) => ({
        type: "heatmap",
        data: data.map(pt => [pt.hour, 3 - si, pt[sev.key] || 0]),
        label: { show: false },
        itemStyle: {
          borderWidth: 2,
          borderColor: "#07091A",
          borderRadius: 4,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          color: (params: any) => {
            const val = params.data[2];
            if (val === 0) return "rgba(255,255,255,0.03)";
            const ratio = Math.max(0.15, val / maxVal);
            return `${sev.color}${Math.round(ratio * 255).toString(16).padStart(2, "0")}`;
          },
        },
        emphasis: {
          itemStyle: { borderColor: "rgba(255,255,255,0.25)", borderWidth: 2 },
        },
      })),
    };
  }, [data]);

  if (loading) {
    return (
      <div className={cn("card p-4", className)}>
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-48 shimmer rounded" />
          <div className="h-5 w-28 shimmer rounded" />
        </div>
        <div className="h-28 shimmer rounded mt-2" />
      </div>
    );
  }

  return (
    <div className={cn("card flex flex-col", className)}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-tiny font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
          >
            Alert Heatmap — 24 Hours
          </span>
          <div className="flex items-center gap-2.5">
            {SEVERITY_ROWS.map(s => (
              <span key={s.key} className="flex items-center gap-1 text-micro" style={{ color: "var(--text-muted)" }}>
                <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        {peakHour && (
          <span className="count-badge-high text-micro font-bold">
            {peakHour}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 py-2">
        <ReactECharts
          option={option}
          style={{ height: "100%", minHeight: 120 }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
}
