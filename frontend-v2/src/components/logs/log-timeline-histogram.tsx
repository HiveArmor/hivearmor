"use client";

import { useEffect, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import { Loader2, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { logAnalyzerService } from "@/services/log-analyzer.service";
import type { ElasticFilter } from "@/services/elastic.service";

type Interval = "hour" | "day" | "week" | "month";

interface Props {
  indexPattern: string;
  filters: ElasticFilter[];
  timeRange: { from: string; to: string } | null;
  className?: string;
}

function pickInterval(range: { from: string; to: string } | null): Interval {
  if (!range) return "hour";
  const ms = new Date(range.to).getTime() - new Date(range.from).getTime();
  const hours = ms / 3_600_000;
  if (hours <= 48) return "hour";
  if (hours <= 336) return "day";   // ≤ 14d
  if (hours <= 2160) return "week"; // ≤ 90d
  return "month";
}

export function LogTimelineHistogram({ indexPattern, filters, timeRange, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [values, setValues] = useState<number[]>([]);

  const fetchHistogram = useCallback(async () => {
    setLoading(true);
    try {
      const backendFilters: { field: string; operator: string; value: unknown }[] = filters.map((f) => ({
        field: f.field,
        operator: f.operator,
        value: f.value,
      }));
      if (timeRange) {
        backendFilters.push({ field: "@timestamp", operator: "IS_BETWEEN", value: [timeRange.from, timeRange.to] });
      }
      const interval = pickInterval(timeRange);
      const result = await logAnalyzerService.getDateHistogram(indexPattern, backendFilters, interval);
      setCategories(result.categories);
      setValues(result.values);
    } finally {
      setLoading(false);
    }
  }, [indexPattern, filters, timeRange]);

  useEffect(() => {
    fetchHistogram();
  }, [fetchHistogram]);

  const maxVal = Math.max(...values, 1);

  const option = {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 8, right: 8, top: 4, bottom: 18, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#131920",
      borderColor: "#1E2D42",
      textStyle: { color: "#E2E8F0", fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        if (!p) return "";
        return `<span style="font-family:monospace;font-size:11px">${p.name}</span><br/><b>${p.value.toLocaleString()}</b> events`;
      },
    },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: {
        color: "#475569",
        fontSize: 10,
        interval: Math.max(0, Math.floor(categories.length / 6) - 1),
        rotate: 0,
        formatter: (v: string) => v.slice(5, 16), // strip year, keep MM-DD HH:mm
      },
      axisLine: { lineStyle: { color: "#1E2D42" } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      show: false,
      max: maxVal * 1.15,
    },
    series: [{
      type: "bar",
      data: values,
      barMaxWidth: 20,
      itemStyle: {
        color: "var(--brand-primary, #3B82F6)",
        borderRadius: [2, 2, 0, 0],
        opacity: 0.75,
      },
      emphasis: {
        itemStyle: { opacity: 1 },
      },
      label: { show: false },
    }],
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-muted" />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className={cn("flex items-center justify-center gap-1.5 h-full text-muted", className)}>
        <BarChart2 className="w-4 h-4" />
        <span className="text-tiny">No histogram data</span>
      </div>
    );
  }

  return (
    <div className={cn("w-full h-full", className)}>
      <ReactECharts
        option={option}
        style={{ width: "100%", height: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
