export type TimeRangePreset = '15m' | '1h' | '4h' | '24h' | '7d' | '30d';

export type TimeRange =
  | { type: 'preset'; preset: TimeRangePreset }
  | { type: 'custom'; from: string; to: string };

export const PRESET_LABELS: Record<TimeRangePreset, string> = {
  '15m': 'Last 15 min',
  '1h': 'Last 1 hour',
  '4h': 'Last 4 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

export const ALL_PRESETS: TimeRangePreset[] = ['15m', '1h', '4h', '24h', '7d', '30d'];

export function getTimeRangeLabel(range: TimeRange): string {
  if (range.type === 'preset') {
    return PRESET_LABELS[range.preset];
  }
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

export function resolveTimeRange(range: TimeRange): { from: string; to: string } {
  if (range.type === 'custom') return { from: range.from, to: range.to };

  const now = new Date();
  const presetMs: Record<TimeRangePreset, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  return {
    from: new Date(now.getTime() - presetMs[range.preset]).toISOString(),
    to: now.toISOString(),
  };
}
