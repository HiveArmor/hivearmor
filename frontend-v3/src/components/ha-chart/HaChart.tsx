import { useId } from 'react';

import type { EChartsOption } from 'echarts';
import ReactEChartsImport from 'echarts-for-react';

const ReactECharts = (typeof ReactEChartsImport === 'object' && ReactEChartsImport !== null && 'default' in ReactEChartsImport)
  ? (ReactEChartsImport as unknown as { default: typeof ReactEChartsImport }).default
  : ReactEChartsImport;

import { registerHiveArmorTheme } from '@/lib/echartsTheme';
import { useThemeStore } from '@/store/theme.store';

export interface HaChartProps {
  option: EChartsOption;
  height?: string | number;
  width?: string | number;
  onChartClick?: (params: unknown) => void;
  onChartReady?: (chart: unknown) => void;
  className?: string;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
  ariaLabel?: string;
  ariaDescription?: string;
}

export function HaChart({
  option,
  height = '100%',
  width = '100%',
  onChartClick,
  onChartReady,
  className,
  notMerge,
  lazyUpdate,
  loading,
  style,
  ariaLabel,
  ariaDescription,
}: HaChartProps): JSX.Element {
  const descId = useId();
  const theme = useThemeStore((state) => state.theme);
  const chartTheme = registerHiveArmorTheme(theme);

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? 'Chart'}
      aria-describedby={ariaDescription ? descId : undefined}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: typeof width === 'number' ? `${width}px` : width,
      }}
    >
      {ariaDescription && (
        <span id={descId} style={{ display: 'none' }}>
          {ariaDescription}
        </span>
      )}
      <ReactECharts
        key={chartTheme}
        option={option}
        theme={chartTheme}
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
          width: typeof width === 'number' ? `${width}px` : width,
          ...style,
        }}
        className={className}
        onEvents={onChartClick ? { click: onChartClick } : undefined}
        onChartReady={onChartReady}
        notMerge={notMerge}
        lazyUpdate={lazyUpdate}
        showLoading={loading}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
