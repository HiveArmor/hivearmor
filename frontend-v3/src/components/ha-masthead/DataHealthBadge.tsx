/**
 * DataHealthBadge — Shows data pipeline health status
 * Polls the authenticated, redacted operational-health projection every 30 seconds.
 */

import { useEffect, useState } from 'react';

import { Activity } from 'lucide-react';

import { useDebounce } from '@/hooks/useDebounce';
import type { ApiError } from '@/lib/apiClient';
import { apiClient } from '@/lib/apiClient';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  message?: string;
}

export function DataHealthBadge(): JSX.Element {
  const [health, setHealth] = useState<HealthStatus>({ status: 'healthy' });
  const [isLoading, setIsLoading] = useState(true);
  const debouncedHealth = useDebounce(health, 300);

  useEffect(() => {
    let mounted = true;

    const fetchHealth = async (): Promise<void> => {
      try {
        const data = await apiClient.get<{ status: string; message?: string }>('/ha-operational-health');
        if (!mounted) return;

        const status = data.status === 'UP' ? 'healthy' : data.status === 'DEGRADED' ? 'degraded' : 'critical';
        setHealth({ status, message: data.message });
        setIsLoading(false);
      } catch (error) {
        if (!mounted) return;
        const apiError = error as ApiError;
        setHealth({ status: 'unknown', message: apiError.message });
        setIsLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const getColor = (): string => {
    switch (debouncedHealth.status) {
      case 'healthy':
        return 'var(--ha-positive)';
      case 'degraded':
        return 'var(--ha-high)';
      case 'critical':
        return 'var(--ha-critical)';
      case 'unknown':
        return 'var(--ha-text-secondary)';
      default:
        return 'var(--ha-text-secondary)';
    }
  };

  const getTooltipText = (): string => {
    if (isLoading) return 'Checking data pipeline health...';
    const statusText = debouncedHealth.status === 'healthy'
      ? 'Healthy'
      : debouncedHealth.status === 'degraded'
        ? 'Degraded'
        : debouncedHealth.status === 'critical'
          ? 'Critical'
          : 'Unavailable';
    return `Data pipeline: ${statusText}${debouncedHealth.message ? ` - ${debouncedHealth.message}` : ''}`;
  };

  return (
    <div
      title={getTooltipText()}
      className="ha-data-health"
      role="status"
      aria-label={getTooltipText()}
    >
      <Activity size={16} color={getColor()} strokeWidth={2} />
    </div>
  );
}
