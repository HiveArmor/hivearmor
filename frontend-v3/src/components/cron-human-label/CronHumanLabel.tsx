/**
 * CronHumanLabel — Converts cron expressions to human-readable labels
 * Spec: RPT-04 §7.4
 * For unrecognised patterns, shows the raw cron with a tooltip.
 */

const COMMON_CRON_PATTERNS: Record<string, string> = {
  '0 * * * *': 'Every hour',
  '0 0 * * *': 'Daily at 12:00 AM',
  '0 8 * * *': 'Daily at 8:00 AM',
  '0 9 * * *': 'Daily at 9:00 AM',
  '0 12 * * *': 'Daily at 12:00 PM',
  '0 17 * * *': 'Daily at 5:00 PM',
  '0 8 * * 1-5': 'Weekdays at 8:00 AM',
  '0 9 * * 1-5': 'Weekdays at 9:00 AM',
  '0 8 * * 1': 'Weekly on Monday at 8:00 AM',
  '0 8 * * 2': 'Weekly on Tuesday at 8:00 AM',
  '0 8 * * 3': 'Weekly on Wednesday at 8:00 AM',
  '0 8 * * 4': 'Weekly on Thursday at 8:00 AM',
  '0 8 * * 5': 'Weekly on Friday at 8:00 AM',
  '0 0 1 * *': 'Monthly on the 1st at 12:00 AM',
  '0 8 1 * *': 'Monthly on the 1st at 8:00 AM',
};

export interface CronHumanLabelProps {
  cron: string;
  className?: string;
}

export function CronHumanLabel({ cron, className = '' }: CronHumanLabelProps): JSX.Element {
  const humanReadable = COMMON_CRON_PATTERNS[cron];

  if (humanReadable) {
    return (
      <span className={className} style={{ color: 'var(--ha-text-primary)' }}>
        {humanReadable}
      </span>
    );
  }

  // Unrecognised pattern — show raw cron in mono font with tooltip
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-sm)',
        color: 'var(--ha-text-secondary)',
      }}
      title={`Custom cron schedule: ${cron}\nFormat: minute hour day-of-month month day-of-week`}
    >
      {cron}
    </span>
  );
}
