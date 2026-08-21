/**
 * Widget Type Definitions
 * Session S32 — Dashboard Studio widget types
 */

import { ChartLineIcon, CubeIcon, FileAltIcon, ListIcon, TableIcon } from '@patternfly/react-icons';

export type WidgetType = 'CHART' | 'METRIC' | 'ALERT_TABLE' | 'TEXT' | 'LIVE_FEED';

export interface WidgetTypeDefinition {
  type: WidgetType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

export const WIDGET_TYPES: WidgetTypeDefinition[] = [
  {
    type: 'CHART',
    label: 'Chart',
    icon: <ChartLineIcon />,
    description: 'ECharts chart — bind to a saved visualization',
  },
  {
    type: 'METRIC',
    label: 'Metric',
    icon: <CubeIcon />,
    description: 'Single KPI value tile',
  },
  {
    type: 'ALERT_TABLE',
    label: 'Alert Table',
    icon: <TableIcon />,
    description: 'Live alert list (AG Grid, compact)',
  },
  {
    type: 'TEXT',
    label: 'Text',
    icon: <FileAltIcon />,
    description: 'Free text / markdown block',
  },
  {
    type: 'LIVE_FEED',
    label: 'Live Feed',
    icon: <ListIcon />,
    description: 'EPS counter or live alert count (SSE)',
  },
];
