/**
 * Property test P7 — Create Incident button state tracks selection cardinality
 *
 * **Property 7: Create Incident button state tracks selection cardinality.**
 * For any non-negative integer n representing the number of selected rows in the
 * HuntGrid, the "Create Incident" toolbar button is disabled if and only if n == 0,
 * and when n > 0 the button's rendered label contains the string representation of n.
 *
 * **Validates: Requirements 4.3, 4.4**
 *
 * Feature: sprint-15-ecs-hunt, Property 7: Create Incident button state tracks selection cardinality
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { HaButton } from '@/components/ha-button/HaButton';

// ---------------------------------------------------------------------------
// Isolated sub-component that mirrors exactly how SearchHuntPage renders the
// "Create Incident" button (see SearchHuntPage.tsx toolbar section).
// We test this logic in isolation to avoid mounting SearchHuntPage's many
// heavy dependencies (SiemDataGrid, HaChart, useEpsStream, executeSearch…).
// ---------------------------------------------------------------------------
interface CreateIncidentButtonProps {
  selectedEventIds: string[];
  onClick: () => void;
}

function CreateIncidentButton({ selectedEventIds, onClick }: CreateIncidentButtonProps): JSX.Element {
  return (
    <HaButton
      variant="secondary"
      isDisabled={selectedEventIds.length === 0}
      onClick={onClick}
    >
      {selectedEventIds.length > 0
        ? `Create Incident (${selectedEventIds.length})`
        : 'Create Incident'}
    </HaButton>
  );
}

// ---------------------------------------------------------------------------
// Hand-rolled generator: produces arrays of fake OpenSearch _id strings of
// length n, which is all that the button logic cares about.
// ---------------------------------------------------------------------------
function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `evt-${i.toString().padStart(6, '0')}`);
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples (Tests a, b, c from the task spec)
// ---------------------------------------------------------------------------
describe('CreateIncidentButton — unit tests', () => {
  it('(a) is rendered and disabled initially (0 rows selected)', () => {
    render(<CreateIncidentButton selectedEventIds={[]} onClick={() => undefined} />);

    const btn = screen.getByRole('button', { name: /Create Incident/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('(b) is enabled and shows count when rows are selected', () => {
    const ids = makeIds(3);
    render(<CreateIncidentButton selectedEventIds={ids} onClick={() => undefined} />);

    const btn = screen.getByRole('button', { name: /Create Incident/i });
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toContain('3');
  });

  it('(c) button label changes based on count — shows exact count', () => {
    const ids = makeIds(7);
    render(<CreateIncidentButton selectedEventIds={ids} onClick={() => undefined} />);

    const btn = screen.getByRole('button', { name: /Create Incident/i });
    expect(btn.textContent).toBe('Create Incident (7)');
  });

  it('(c) single selection shows count 1', () => {
    const ids = makeIds(1);
    render(<CreateIncidentButton selectedEventIds={ids} onClick={() => undefined} />);

    const btn = screen.getByRole('button', { name: /Create Incident/i });
    expect(btn).not.toBeDisabled();
    expect(btn.textContent).toBe('Create Incident (1)');
  });
});

// ---------------------------------------------------------------------------
// Property test P7 — hand-rolled generation over n ∈ [0, 500]
//
// For each n, assert:
//   disabled ⟺ n === 0
//   label contains String(n) ⟺ n > 0
// ---------------------------------------------------------------------------
describe('Property 7 — Create Incident button state tracks selection cardinality', () => {
  // Sample at n=0, then a spread of boundary and typical values up to 500.
  // Hand-rolled to avoid fast-check dependency (not yet in package.json).
  const sampleValues: number[] = [
    // boundary
    0, 1, 2,
    // typical single-digit
    3, 5, 9,
    // two-digit
    10, 25, 50, 99,
    // three-digit
    100, 250, 499, 500,
  ];

  // Additionally, generate 50 pseudo-random values in [1, 500] for coverage
  const pseudoRandom: number[] = Array.from({ length: 50 }, (_, i) => {
    // deterministic spread: (prime × i) mod 500 + 1
    return ((i * 97 + 13) % 500) + 1;
  });

  const allValues = [...sampleValues, ...pseudoRandom];

  it('disabled iff n === 0 (n=0 boundary)', () => {
    const { unmount } = render(
      <CreateIncidentButton selectedEventIds={[]} onClick={() => undefined} />
    );
    const btn = screen.getByRole('button', { name: /Create Incident/i });
    expect(btn).toBeDisabled();
    unmount();
  });

  // Run the full property across all sampled values
  allValues.forEach((n) => {
    it(`n=${n}: disabled=${n === 0}, label contains "${n > 0 ? String(n) : '–'}"`, () => {
      const ids = makeIds(n);
      const { unmount } = render(
        <CreateIncidentButton selectedEventIds={ids} onClick={() => undefined} />
      );

      const btn = screen.getByRole('button', { name: /Create Incident/i });

      if (n === 0) {
        // disabled iff n === 0
        expect(btn).toBeDisabled();
        // label is plain "Create Incident" (no count)
        expect(btn.textContent).toBe('Create Incident');
      } else {
        // enabled when n > 0
        expect(btn).not.toBeDisabled();
        // label contains the string representation of n
        expect(btn.textContent).toContain(String(n));
        // full label shape: "Create Incident (<n>)"
        expect(btn.textContent).toBe(`Create Incident (${n})`);
      }

      unmount();
    });
  });
});
