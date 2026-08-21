/**
 * Analyst Queue — Type Definitions
 * Alert queue specific types per CMD-02 spec §1–9
 */

import type { AlertStatus } from '@/constants/status.constants';
import type { SeverityLevel } from '@/lib/severity';

export interface QueueAlert {
  id: string;
  severity: number; // numeric backend value
  timestamp: string; // ISO8601
  title: string;
  adversary: {
    networkId?: string; // IP or hostname
  };
  target: {
    networkId?: string; // IP or hostname
  };
  category: string;
  status: AlertStatus;
  assignedTo?: string;
  tags?: string[];
}

export interface QueueFilters {
  severity?: SeverityLevel[];
  status?: AlertStatus[];
  category?: string[];
  assignedTo?: string;
  q?: string; // text search
  timeFrom?: string;
  timeTo?: string;
}

export interface QueuePagination {
  page: number;
  size: number;
}
