/**
 * WorkItemTypeCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.2
 */

import type { ForwardRefExoticComponent, RefAttributes } from 'react';

import type { LucideProps } from 'lucide-react';
import {
  AlertTriangle,
  CheckSquare,
  Clock,
  Database,
  Layers,
  Target,
  UserCheck,
  XCircle,
} from 'lucide-react';

import type { WorkItemType } from '@/types/alert.types';

export interface WorkItemTypeCellProps {
  value: WorkItemType;
}

type LucideComponent = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;

const TYPE_CONFIG: Record<WorkItemType, { label: string; Icon: LucideComponent }> = {
  alert:             { label: 'Alert',             Icon: AlertTriangle },
  correlated_group:  { label: 'Correlated Group',  Icon: Layers },
  incident:          { label: 'Incident',          Icon: Target },
  task:              { label: 'Task',              Icon: CheckSquare },
  approval:          { label: 'Approval',          Icon: UserCheck },
  failed_automation: { label: 'Failed Automation', Icon: XCircle },
  sla_risk:          { label: 'SLA Risk',          Icon: Clock },
  data_quality:      { label: 'Data Quality',      Icon: Database },
};

export function WorkItemTypeCell({ value }: WorkItemTypeCellProps): JSX.Element {
  const config = TYPE_CONFIG[value] ?? { label: value, Icon: AlertTriangle };
  const { label, Icon } = config;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--ha-text-sm)',
      }}
    >
      <Icon size={14} style={{ color: 'var(--ha-text-secondary)', flexShrink: 0 }} />
      <span style={{ color: 'var(--ha-text-primary)' }}>{label}</span>
    </span>
  );
}
