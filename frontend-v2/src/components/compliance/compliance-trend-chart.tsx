"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { TrendingUp, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FrameworkTrendSeries {
  id: string;
  name: string;
  color: string;
  data: number[];   // one entry per week (newest last)
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const PAD = { top: 16, right: 16, bottom: 32, left: 36 };

function buildPath(data: number[], w: number, h: number, min: number, max: number): string {
  const range = max - min || 1;
  const steps = data.length > 1 ? data.length - 1 : 1;
  return data
    .map((v, i) => {
      const x = PAD.left + (i / steps) * w;
      const y = PAD.top + h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function buildArea(data: number[], w: number, h: number, min: number, max: number): string {
  const line = buildPath(data, w, h, min, max);
  const steps = data.length > 1 ? data.length - 1 : 1;
  const lastX = PAD.left + (((data.length - 1) / steps) * w);
  const firstX = PAD.left;
  const baseY = PAD.top + h;
  return `${line} L${lastX},${baseY} L${firstX},${baseY} Z`;
}

interface TooltipData {
  x: number;
  y: number;
  weekLabel: string;
  values: { id: string; name: string; color: string; value: number }[];
}

interface ComplianceTrendChartProps {
  series?: FrameworkTrendSeries[];
}

export function ComplianceTrendChart({ series = [] }: ComplianceTrendChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isEmpty = series.length === 0;

  const visible = series.filter((s) => !hidden.has(s.id));

  // Number of data points — use the max across all series
  const dataLen = Math.max(...series.map((s) => s.data.length), 1);
  // Build x-axis labels matching actual data length (most recent weeks)
  const xLabels = useMemo(() =>
    dataLen === 1
      ? ["Current"]
      : Array.from({ length: dataLen }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (dataLen - 1 - i) * 7);
          return d.toLocaleDateString([], { month: "short", day: "numeric" });
        }),
  [dataLen]);

  const allValues = isEmpty ? [0] : series.flatMap((s) => s.data);
  const min = Math.max(0, Math.min(...allValues) - 5);
  const max = Math.min(100, Math.max(...allValues) + 5);

  const toggleSeries = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dataLen <= 1) return; // no hover interaction for single-point snapshots
    const rect = svgRef.current!.getBoundingClientRect();
    const svgEl = svgRef.current!;
    const svgW = svgEl.clientWidth;
    const svgH = svgEl.clientHeight;
    const chartW = svgW - PAD.left - PAD.right;
    const chartH = svgH - PAD.top - PAD.bottom;
    const mx = e.clientX - rect.left;

    // Snap to nearest data index
    const raw = (mx - PAD.left) / chartW;
    const idx = Math.round(Math.max(0, Math.min(1, raw)) * (xLabels.length - 1));
    const steps = xLabels.length > 1 ? xLabels.length - 1 : 1;
    const snapX = PAD.left + (idx / steps) * chartW;
    setCrosshairX(snapX);

    const range = max - min || 1;
    const values = series
      .filter((s) => !hidden.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, color: s.color, value: s.data[idx] ?? s.data[s.data.length - 1] }));

    const vy = values[0] ? PAD.top + chartH - ((values[0].value - min) / range) * chartH : PAD.top;
    setTooltip({ x: snapX, y: vy, weekLabel: xLabels[idx], values });
  }, [series, hidden, min, max, dataLen, xLabels]);

  const handleMouseLeave = () => {
    setTooltip(null);
    setCrosshairX(null);
  };

  if (isEmpty) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[220px]">
        <BarChart3 className="w-8 h-8 text-muted" />
        <div>
          <p className="text-small font-medium text-secondary">No trend data yet</p>
          <p className="text-tiny text-muted mt-1">Score history will appear once frameworks have been evaluated.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col overflow-hidden" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand" />
          <h3 className="text-small font-semibold text-primary">
            {dataLen === 1 ? "Score Snapshot" : `Score Trend — ${dataLen} Weeks`}
          </h3>
        </div>
        {/* Legend / toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          {series.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSeries(s.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-tiny transition-colors",
                hidden.has(s.id) ? "opacity-35" : ""
              )}
            >
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: s.color }} />
              <span className="text-muted">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SVG chart */}
      <div className="flex-1 min-h-[200px] relative px-2 py-2">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ minHeight: 200 }}
        >
          {/* We use a viewBox trick — render relative to actual clientWidth */}
          {(() => {
            const svgEl = svgRef.current;
            const svgW = svgEl?.clientWidth ?? 600;
            const svgH = svgEl?.clientHeight ?? 220;
            const chartW = svgW - PAD.left - PAD.right;
            const chartH = svgH - PAD.top - PAD.bottom;
            const range = max - min || 1;

            // Y grid lines
            const yTicks = [0, 25, 50, 75, 100].filter((t) => t >= min - 5 && t <= max + 5);

            return (
              <g>
                {/* Y grid + labels */}
                {yTicks.map((t) => {
                  const y = PAD.top + chartH - ((t - min) / range) * chartH;
                  return (
                    <g key={t}>
                      <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke="var(--surface-border)" strokeWidth={0.8} />
                      <text x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">{t}%</text>
                    </g>
                  );
                })}

                {/* X labels */}
                {xLabels.filter((_, i) => xLabels.length <= 4 || i % 3 === 0 || i === xLabels.length - 1).map((w, n) => {
                  const steps = xLabels.length > 1 ? xLabels.length - 1 : 1;
                  const origIdx = xLabels.indexOf(w);
                  const x = PAD.left + (origIdx / steps) * chartW;
                  return (
                    <text key={`${w}-${n}`} x={x} y={PAD.top + chartH + 20} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{w}</text>
                  );
                })}

                {/* Area fills */}
                {visible.map((s) => (
                  <path
                    key={`area-${s.id}`}
                    d={buildArea(s.data, chartW, chartH, min, max)}
                    fill={s.color}
                    opacity="0.07"
                  />
                ))}

                {/* Lines */}
                {visible.map((s) => (
                  <path
                    key={`line-${s.id}`}
                    d={buildPath(s.data, chartW, chartH, min, max)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}

                {/* Dots at latest value */}
                {visible.map((s) => {
                  const last = s.data[s.data.length - 1];
                  const steps = s.data.length > 1 ? s.data.length - 1 : 1;
                  const x = PAD.left + ((s.data.length - 1) / steps) * chartW;
                  const y = PAD.top + chartH - ((last - min) / range) * chartH;
                  return (
                    <circle key={`dot-${s.id}`} cx={x} cy={y} r={3} fill={s.color} stroke="var(--surface-primary)" strokeWidth={1.5} />
                  );
                })}

                {/* Crosshair */}
                {crosshairX !== null && (
                  <line
                    x1={crosshairX} y1={PAD.top}
                    x2={crosshairX} y2={PAD.top + chartH}
                    stroke="var(--surface-border-strong)"
                    strokeWidth={1}
                    strokeDasharray="3 2"
                  />
                )}

                {/* Hover dots */}
                {tooltip && visible.map((s) => {
                  const idx = xLabels.indexOf(tooltip.weekLabel);
                  if (idx < 0) return null;
                  const v = s.data[idx] ?? s.data[s.data.length - 1];
                  const steps = xLabels.length > 1 ? xLabels.length - 1 : 1;
                  const x = PAD.left + (idx / steps) * chartW;
                  const y = PAD.top + chartH - ((v - min) / range) * chartH;
                  return <circle key={`hdot-${s.id}`} cx={x} cy={y} r={4} fill={s.color} stroke="var(--surface-primary)" strokeWidth={2} />;
                })}
              </g>
            );
          })()}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 bg-surface-primary border border-surface-border rounded-lg shadow-dropdown p-2.5 pointer-events-none animate-scale-in min-w-[140px]"
            style={{
              left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 600) - 160),
              top: Math.max(8, tooltip.y - 60),
            }}
          >
            <p className="text-tiny font-medium text-primary mb-1.5">{tooltip.weekLabel}</p>
            <div className="space-y-1">
              {tooltip.values.sort((a, b) => b.value - a.value).map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: v.color }} />
                    <span className="text-tiny text-muted">{v.name}</span>
                  </div>
                  <span className="text-tiny font-mono font-medium text-primary">{v.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
