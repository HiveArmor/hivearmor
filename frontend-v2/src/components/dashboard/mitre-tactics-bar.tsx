"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";
import type { MitreTacticCount } from "@/services/overview.service";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface MitreTacticsBarProps {
  data: MitreTacticCount[];
  loading?: boolean;
  className?: string;
}

export function MitreTacticsBar({ data, loading, className }: MitreTacticsBarProps) {
  const activeCount = useMemo(() => data.filter(d => d.count > 0).length, [data]);

  const option = useMemo(() => {
    if (!data.length) return {};
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);

    return {
      animation: true,
      animationDuration: 600,
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "none" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const d = params[0];
          const tactic = sorted[d.dataIndex];
          return (
            `<div style="font-size:12px;line-height:1.8;font-family:system-ui">` +
            `<span style="color:#EEF2FF;font-weight:700">${tactic.name}</span><br/>` +
            `<span style="color:${tactic.color};font-size:10px">${tactic.id}</span><br/>` +
            `<span style="color:#8B9BB5">${d.value} alerts this week</span>` +
            `</div>`
          );
        },
        backgroundColor: "#0D1221",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        textStyle: { color: "#EEF2FF" },
        extraCssText: "border-radius:8px;padding:8px 12px;",
      },
      grid: { top: 8, right: 40, bottom: 4, left: 8, containLabel: true },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        data: sorted.map(d => d.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#8B9BB5",
          fontSize: 11,
          fontWeight: 500,
          width: 120,
          overflow: "truncate",
        },
        inverse: false,
      },
      series: [{
        type: "bar",
        data: sorted.map(d => ({
          value: d.count,
          itemStyle: {
            color: d.color,
            opacity: 0.85,
            borderRadius: [0, 3, 3, 0],
          },
          emphasis: { itemStyle: { opacity: 1 } },
        })),
        label: {
          show: true,
          position: "right",
          color: "#6B7FA0",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "system-ui",
        },
        barMaxWidth: 14,
        barMinHeight: 4,
        backgroundStyle: { color: "rgba(255,255,255,0.03)", borderRadius: [0, 3, 3, 0] },
        showBackground: true,
      }],
    };
  }, [data]);

  if (loading) {
    return (
      <div className={cn("card flex flex-col h-full", className)}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="h-4 w-36 shimmer rounded" />
        </div>
        <div className="flex-1 p-4 space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-3 w-28 shimmer rounded" />
              <div className="h-3 flex-1 shimmer rounded" />
              <div className="h-3 w-6 shimmer rounded" />
            </div>
          ))}
        </div>
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
        <div className="flex items-center gap-2.5">
          <span
            className="text-tiny font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
          >
            Top MITRE ATT&amp;CK Tactics
          </span>
          {activeCount > 0 && (
            <span className="count-badge-muted">{activeCount} ACTIVE</span>
          )}
        </div>
        <Link
          href="/rules/coverage"
          className="flex items-center gap-1 text-tiny transition-opacity hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          Coverage <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 py-2">
        <ReactECharts
          option={option}
          style={{ height: "100%", minHeight: 240 }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
}
