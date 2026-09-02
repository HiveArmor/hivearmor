/**
 * ProcessTree — Apache ECharts interactive tree chart for HiveArmor EDR.
 *
 * Renders a top-down orthogonal process tree for the nodes assembled by
 * `buildProcessTree` in `edrService.ts`.
 *
 * Key implementation notes:
 *   - All colour values are resolved at render time via `useHaThemeTokens`.
 *     No `var(--ha-*)` strings are ever passed into ECharts option objects.
 *   - ECharts is initialised and disposed imperatively (not via echarts-for-react)
 *     so the component retains full control over the instance lifecycle and the
 *     window resize listener (Requirement 1.11).
 *   - Suspicious nodes override both fill and label colour to `--ha-critical`.
 *     Non-suspicious nodes use `--ha-primary` fill and `--ha-text-primary` label.
 */

import { useEffect, useRef } from 'react';

import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import type { ProcessNodeDTO } from '@/types/edr';

// ---------------------------------------------------------------------------
// ECharts tree node shape (typed to avoid `any`)
// ---------------------------------------------------------------------------

interface TreeNodeItemStyle {
  color: string;
  borderColor?: string;
}

interface TreeNodeLabel {
  color: string;
}

interface TreeNode {
  name: string;
  value: number;
  itemStyle: TreeNodeItemStyle;
  label: TreeNodeLabel;
  children: TreeNode[];
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface ProcessTreeProps {
  /**
   * Flat list of process nodes — assembled into a forest by the parent via
   * `buildProcessTree` before being passed here as the `roots` array.
   */
  processes: ProcessNodeDTO[];
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Recursively converts a `ProcessNodeDTO` (with populated `children`) into the
 * shape that ECharts' tree series expects.
 *
 * Suspicious nodes use `--ha-critical` for both fill and label.
 * Non-suspicious nodes use `--ha-primary` fill and `--ha-text-primary` label.
 */
function toEChartsNode(
  n: ProcessNodeDTO,
  criticalColor: string,
  primaryColor: string,
  textPrimaryColor: string,
  borderColor: string,
): TreeNode {
  const isSuspicious = n.suspicious === true;
  return {
    name: n.name,
    value: n.pid,
    itemStyle: {
      color: isSuspicious ? criticalColor : primaryColor,
      borderColor,
    },
    label: {
      color: isSuspicious ? criticalColor : textPrimaryColor,
    },
    children: (n.children ?? []).map((child) =>
      toEChartsNode(child, criticalColor, primaryColor, textPrimaryColor, borderColor),
    ),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ProcessTree renders an interactive Apache ECharts tree chart visualising
 * parent-child process relationships for a single endpoint time window.
 *
 * Handles four distinct states:
 *   1. Loading  — `role="status"` container, no ECharts instance
 *   2. Error    — `role="alert"` container with failure message
 *   3. Empty    — text matching `/no process data/i`
 *   4. Loaded   — ECharts tree chart
 */
export function ProcessTree({
  processes,
  isLoading,
  isError,
  error: _error,
}: ProcessTreeProps): JSX.Element {
  // Resolve all colour tokens once per render cycle. The memoisation in
  // `useHaThemeTokens` ensures the ECharts option is only rebuilt when the
  // token tuple reference changes — which in practice means only on mount
  // and theme switches.
  const TOKEN_KEYS = [
    '--ha-primary',
    '--ha-critical',
    '--ha-text-primary',
    '--ha-border',
    '--ha-surface-primary',
  ] as const;

  const tokens = useHaThemeTokens(TOKEN_KEYS);

  // ------------------------------------------------------------------
  // Loading state — do NOT init ECharts (Requirement 1.8)
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading process tree"
        style={{ width: '100%', height: '100%' }}
      />
    );
  }

  // ------------------------------------------------------------------
  // Error state (Requirement 1.9)
  // ------------------------------------------------------------------
  if (isError) {
    return (
      <div role="alert" style={{ padding: '1rem' }}>
        Failed to load process tree
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Empty state (Requirement 1.10)
  // ------------------------------------------------------------------
  if (processes.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--ha-text-secondary)' }}>
        No process data available for the selected window.
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Loaded state — ECharts tree chart
  // ------------------------------------------------------------------
  return (
    <ProcessTreeChart
      processes={processes}
      tokens={tokens}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component — renders only when processes.length > 0
// Extracted so the useEffect for ECharts init only runs in the loaded state.
// ---------------------------------------------------------------------------

interface ProcessTreeChartProps {
  processes: ProcessNodeDTO[];
  tokens: Record<
    | '--ha-primary'
    | '--ha-critical'
    | '--ha-text-primary'
    | '--ha-border'
    | '--ha-surface-primary',
    string
  >;
}

function ProcessTreeChart({ processes, tokens }: ProcessTreeChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialise ECharts on the container div.
    const chart = echarts.init(containerRef.current);

    const roots: TreeNode[] = processes.map((n) =>
      toEChartsNode(
        n,
        tokens['--ha-critical'],
        tokens['--ha-primary'],
        tokens['--ha-text-primary'],
        tokens['--ha-border'],
      ),
    );

    const option: EChartsOption = {
      backgroundColor: tokens['--ha-surface-primary'],
      tooltip: { trigger: 'item', triggerOn: 'mousemove' },
      series: [
        {
          type: 'tree',
          orient: 'TB',
          layout: 'orthogonal',
          symbol: 'roundRect',
          expandAndCollapse: true,
          initialTreeDepth: 4,
          data: roots,
          itemStyle: {
            color: tokens['--ha-primary'],
            borderColor: tokens['--ha-border'],
          },
          label: {
            color: tokens['--ha-text-primary'],
          },
          lineStyle: {
            color: tokens['--ha-border'],
          },
        },
      ],
    };

    chart.setOption(option);

    // Register a resize handler so the chart fills its container after
    // viewport changes (Requirement 1.11).
    const onResize = (): void => {
      chart.resize();
    };
    window.addEventListener('resize', onResize);

    // Cleanup: remove listener and dispose ECharts instance on unmount.
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  // Re-run the effect only when the token values or process data changes.
  // `processes` and `tokens` are both stable references across normal renders.
   
  }, [processes, tokens]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
      aria-label="Process tree chart"
    />
  );
}
