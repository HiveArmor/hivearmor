/**
 * AssigneeCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.6
 * Shows avatar (initials) + name, or "—" if unassigned.
 */

import type { AssigneeDTO } from '@/types/alert.types';

export interface AssigneeCellProps {
  value: AssigneeDTO | null;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function AssigneeCell({ value }: AssigneeCellProps): JSX.Element {
  if (!value) {
    return (
      <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>—</span>
    );
  }

  const initials = getInitials(value.firstName, value.lastName);
  const displayName = `${value.firstName} ${value.lastName}`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--ha-text-sm)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--ha-fill-primary-muted)',
          color: 'var(--ha-primary)',
          fontSize: 'var(--ha-text-xs)',
          fontWeight: 'var(--ha-weight-semibold)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {initials}
      </span>
      <span
        title={displayName}
        style={{
          color: 'var(--ha-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName}
      </span>
    </span>
  );
}
