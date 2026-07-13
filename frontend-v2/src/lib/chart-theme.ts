/**
 * ECharts dark theme configuration for HiveArmor Visualization Builder.
 * Matches the HiveArmor design system with transparent background,
 * muted text, and a distinct brand color palette.
 */

export const DARK_CHART_THEME = {
  color: [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#F23535",
    "#22D3EE",
    "#8B5CF6",
    "#EC4899",
    "#64748B",
  ],

  backgroundColor: "transparent",

  textStyle: {
    color: "#8B9BB5",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  title: {
    textStyle: {
      color: "#A8B8D0",
      fontSize: 13,
      fontWeight: 600,
    },
    subtextStyle: {
      color: "#6B7FA0",
      fontSize: 11,
    },
  },

  legend: {
    textStyle: {
      color: "#8B9BB5",
      fontSize: 11,
    },
    inactiveColor: "#3A4A60",
  },

  tooltip: {
    backgroundColor: "#0D1221",
    borderColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderRadius: 8,
    textStyle: {
      color: "#EEF2FF",
      fontSize: 12,
    },
    extraCssText: "box-shadow: 0 8px 32px rgba(0,0,0,0.50);",
  },

  categoryAxis: {
    axisLine: {
      show: true,
      lineStyle: { color: "rgba(255,255,255,0.06)" },
    },
    axisTick: { show: false },
    axisLabel: {
      color: "#6B7FA0",
      fontSize: 11,
    },
    splitLine: { show: false },
  },

  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: "#6B7FA0",
      fontSize: 11,
    },
    splitLine: {
      show: true,
      lineStyle: {
        color: "rgba(255,255,255,0.04)",
        type: "dashed",
      },
    },
  },

  line: {
    smooth: false,
    symbol: "circle",
    symbolSize: 4,
    lineStyle: {
      width: 2,
    },
  },

  bar: {
    barMaxWidth: 40,
    itemStyle: {
      borderRadius: [2, 2, 0, 0],
    },
  },

  pie: {
    itemStyle: {
      borderColor: "transparent",
      borderWidth: 2,
    },
    label: {
      color: "#94A3B8",
    },
  },

  gauge: {
    axisLine: {
      lineStyle: {
        color: [[1, "rgba(255,255,255,0.08)"]],
      },
    },
    axisTick: {
      lineStyle: { color: "#3A4A60" },
    },
    axisLabel: { color: "#6B7FA0" },
    detail: { color: "#EEF2FF" },
  },

  grid: {
    left: "3%",
    right: "4%",
    bottom: "3%",
    top: "8%",
    containLabel: true,
  },

  dataZoom: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.08)",
    fillerColor: "rgba(59, 130, 246, 0.08)",
    handleColor: "#3B82F6",
    textStyle: { color: "#6B7FA0" },
  },
} as const;

/** Theme name used when registering with ECharts */
export const DARK_CHART_THEME_NAME = "hivearmor-dark";
