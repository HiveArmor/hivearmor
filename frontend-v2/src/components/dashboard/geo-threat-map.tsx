"use client";

import ReactECharts from "echarts-for-react";
import { useMemo, useEffect, useState } from "react";
import type { GeoThreatPoint } from "@/services/overview.service";
import { cn } from "@/lib/utils";
import * as echarts from "echarts";

// Register world GeoJSON once — fetched from CDN and cached in module scope
let worldRegistered = false;
let worldRegistering: Promise<void> | null = null;

function ensureWorldMap(): Promise<void> {
  if (worldRegistered) return Promise.resolve();
  if (worldRegistering) return worldRegistering;
  worldRegistering = fetch(
    "https://raw.githubusercontent.com/apache/echarts/5.5.0/test/data/map/json/world.json"
  )
    .then((r) => r.json())
    .then((geoJson) => {
      echarts.registerMap("world", geoJson);
      worldRegistered = true;
    })
    .catch(() => {
      // fetch failed (offline / sandbox) — mark as registered with empty map so
      // the chart renders without crashing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      echarts.registerMap("world", { type: "FeatureCollection", features: [] } as any);
      worldRegistered = true;
    });
  return worldRegistering;
}

interface GeoThreatMapProps {
  data: GeoThreatPoint[];
  loading?: boolean;
  className?: string;
}

export function GeoThreatMap({ data, loading, className }: GeoThreatMapProps) {
  const [mapReady, setMapReady] = useState(worldRegistered);

  useEffect(() => {
    if (worldRegistered) return;
    ensureWorldMap().then(() => setMapReady(true));
  }, []);

  const option = useMemo(() => {
    if (!data.length) return {};

    const maxCount = Math.max(...data.map(d => d.count), 1);

    return {
      animation: false,
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (!params.data) return "";
          return `<div style="font-size:12px;line-height:1.8">
            <b style="color:#E2E8F0">${params.data[3] || "Unknown"}</b><br/>
            <span style="color:var(--color-critical)">${params.data[2]} attack${params.data[2] !== 1 ? "s" : ""} detected</span>
          </div>`;
        },
        backgroundColor: "#0D1221",
        borderColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        textStyle: { color: "#EEF2FF" },
        extraCssText: "border-radius:8px;padding:8px 12px;",
      },
      geo: {
        type: "map",
        map: "world",
        roam: false,
        silent: true,
        zoom: 1.2,
        center: [20, 20],
        itemStyle: {
          areaColor: "#0D1525",
          borderColor: "rgba(255,255,255,0.06)",
          borderWidth: 0.5,
        },
        emphasis: { disabled: true },
        select: { disabled: true },
      },
      series: [{
        type: "scatter",
        coordinateSystem: "geo",
        data: data.map(pt => ({
          value: [pt.lng, pt.lat, pt.count, pt.country],
          symbolSize: Math.max(6, Math.sqrt(pt.count / maxCount) * 24),
          itemStyle: {
            color: new echarts.graphic.RadialGradient(0.4, 0.3, 1, [
              { offset: 0, color: "rgba(255, 69, 96, 0.9)"  },
              { offset: 1, color: "rgba(255, 69, 96, 0.1)"  },
            ]),
          },
          emphasis: {
            itemStyle: {
              color: "rgba(255, 69, 96, 1)",
              shadowBlur: 16,
              shadowColor: "rgba(255, 69, 96, 0.6)",
            },
          },
        })),
        zlevel: 5,
      }],
    };
  }, [data]);

  if (loading || !mapReady) {
    return (
      <div className={cn("card p-4 h-full", className)}>
        <div className="h-4 w-36 shimmer rounded mb-3" />
        <div className="flex-1 h-48 shimmer rounded" />
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
        <span
          className="text-tiny font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.09em", fontSize: "10px" }}
        >
          Geo Threat Origin
        </span>
        <div className="flex items-center gap-1.5 text-micro" style={{ color: "var(--text-muted)" }}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--color-critical)", boxShadow: "0 0 6px var(--color-critical-glow)" }}
          />
          Attack sources · Last 24h
        </div>
      </div>
      <div className="flex-1 min-h-0 px-2 py-2">
        <ReactECharts
          option={option}
          style={{ height: "100%", minHeight: 200 }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </div>
  );
}
