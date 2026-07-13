"use client";

import ReactECharts from "echarts-for-react";
import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  filled?: boolean;
}

export function Sparkline({ data, color = "#3B82F6", height = 32, filled = true }: SparklineProps) {
  const option = useMemo(() => ({
    animation: false,
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: "category", show: false, data: data.map((_, i) => i) },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    series: [{
      type: "line",
      data,
      smooth: true,
      symbol: "none",
      lineStyle: { color, width: 1.5 },
      areaStyle: filled ? {
        color: {
          type: "linear",
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + "40" },
            { offset: 1, color: color + "00" },
          ],
        },
      } : undefined,
    }],
  }), [data, color, filled]);

  if (!data?.length) return <div style={{ height }} className="bg-surface-tertiary rounded opacity-30" />;

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}
