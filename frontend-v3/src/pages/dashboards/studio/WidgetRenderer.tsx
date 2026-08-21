/**
 * WidgetRenderer — Dispatcher for all widget types
 * Session S33 — Dashboard Studio widget renderers (§8, DSH-03)
 */

import type React from 'react';

import type { AlertTableWidgetConfig } from './renderers/AlertTableRenderer';
import { AlertTableRenderer } from './renderers/AlertTableRenderer';
import type { ChartWidgetConfig } from './renderers/ChartRenderer';
import { ChartRenderer } from './renderers/ChartRenderer';
import type { LiveFeedWidgetConfig } from './renderers/LiveFeedRenderer';
import { LiveFeedRenderer } from './renderers/LiveFeedRenderer';
import type { MetricWidgetConfig } from './renderers/MetricRenderer';
import { MetricRenderer } from './renderers/MetricRenderer';
import type { TextWidgetConfig } from './renderers/TextRenderer';
import { TextRenderer } from './renderers/TextRenderer';
import type { WidgetType } from './widgetTypes.constants';

export interface WidgetRendererProps {
  type: WidgetType;
  data?: unknown;
  config: WidgetConfig;
  height?: string | number;
}

export type WidgetConfig =
  | ChartWidgetConfig
  | MetricWidgetConfig
  | AlertTableWidgetConfig
  | TextWidgetConfig
  | LiveFeedWidgetConfig;

export function WidgetRenderer({ type, data, config, height }: WidgetRendererProps): React.JSX.Element {
  switch (type) {
    case 'CHART':
      return <ChartRenderer data={data} config={config as ChartWidgetConfig} height={height} />;

    case 'METRIC':
      return <MetricRenderer data={data} config={config as MetricWidgetConfig} />;

    case 'ALERT_TABLE':
      return <AlertTableRenderer data={data} config={config as AlertTableWidgetConfig} height={height} />;

    case 'TEXT':
      return <TextRenderer config={config as TextWidgetConfig} />;

    case 'LIVE_FEED':
      return <LiveFeedRenderer config={config as LiveFeedWidgetConfig} />;

    default:
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--ha-text-secondary)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          Unknown widget type: {type}
        </div>
      );
  }
}
