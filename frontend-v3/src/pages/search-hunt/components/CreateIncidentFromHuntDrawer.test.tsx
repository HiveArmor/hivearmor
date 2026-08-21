/**
 * CreateIncidentFromHuntDrawer — Property test P8
 *
 * **Property 8: CreateIncidentDrawer submits the exact selection as `evidenceEventIds`.**
 * **Validates: Requirements 4.8**
 *
 * For a random ordered array S of unique string IDs, mount the drawer with
 * selectedEventIds=S, fill required fields, submit, and assert the POST body
 * sent to `/ha-incidents` has `evidenceEventIds` deep-equal to S (same order,
 * same contents).
 *
 * Feature: sprint-15-ecs-hunt, Property 8: CreateIncidentDrawer submits the exact
 * selection as evidenceEventIds
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @/store/auth.store (required by apiClient module) ───────────────────
vi.mock('@/store/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      selectedTenantId: null,
      logout: vi.fn(),
    })),
  },
}));

// ── Capture POST body sent through apiClient ──────────────────────────────────
// Declare the captured variables at module scope so tests can inspect them.
let capturedPostPath = '';
let capturedPostBody: unknown = undefined;

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn(async (path: string, body: unknown) => {
      capturedPostPath = path;
      capturedPostBody = body;
      return { id: 42 };
    }),
  },
}));

// ── Mock @tanstack/react-query ────────────────────────────────────────────────
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
      isError: false,
    })),
    useMutation: vi.fn((opts: {
      mutationFn: (body: unknown) => Promise<unknown>;
      onSuccess?: (data: unknown) => void;
    }) => {
      return {
        mutate: vi.fn(async (body: unknown) => {
          const data = await opts.mutationFn(body);
          opts.onSuccess?.(data);
        }),
        isPending: false,
        isError: false,
        error: null,
      };
    }),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

// ── Mock react-router-dom's useNavigate ───────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Import component AFTER all mocks are declared ────────────────────────────
// eslint-disable-next-line import/order
import type { CreateIncidentFromHuntRequest } from '@/types/search';
// eslint-disable-next-line import/order
import { CreateIncidentFromHuntDrawer } from './CreateIncidentFromHuntDrawer';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Hand-rolled ID generator — produces `n` distinct, unique string IDs.
 */
function makeEventIds(n: number, prefix = 'evt'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i.toString().padStart(6, '0')}`);
}

interface DrawerOptions {
  selectedEventIds?: string[];
  currentQuery?: string;
  isOpen?: boolean;
}

/**
 * Render the drawer in an open state with the given props.
 * currentQuery defaults to a non-empty value so the incident name is pre-filled,
 * making the submit button immediately enabled.
 */
function renderDrawer({
  selectedEventIds = [],
  currentQuery = 'threat hunt query',
  isOpen = true,
}: DrawerOptions = {}) {
  const onClose = vi.fn();
  const result = render(
    <CreateIncidentFromHuntDrawer
      isOpen={isOpen}
      onClose={onClose}
      selectedEventIds={selectedEventIds}
      currentQuery={currentQuery}
    />
  );
  return { ...result, onClose };
}

/**
 * Click the "Create Incident" submit button.
 */
function clickSubmit() {
  const btn = screen.getByRole('button', { name: /Create Incident/i });
  fireEvent.click(btn);
}

// ── Reset captured values and mocks before each test ─────────────────────────
beforeEach(() => {
  capturedPostPath = '';
  capturedPostBody = undefined;
  mockNavigate.mockReset();
});

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('CreateIncidentFromHuntDrawer — unit tests', () => {
  it('renders title when isOpen is true', () => {
    renderDrawer({ selectedEventIds: ['a', 'b', 'c'] });
    expect(screen.getByText('Create Incident from Hunt')).toBeDefined();
  });

  it('returns null when isOpen is false', () => {
    const { container } = renderDrawer({ isOpen: false, selectedEventIds: ['a'] });
    expect(container.firstChild).toBeNull();
  });

  it('shows "N events selected" for multi-selection', () => {
    renderDrawer({ selectedEventIds: ['x', 'y', 'z'] });
    expect(screen.getByText('3 events selected')).toBeDefined();
  });

  it('shows "1 event selected" for single-element selection', () => {
    renderDrawer({ selectedEventIds: ['only-one'] });
    expect(screen.getByText('1 event selected')).toBeDefined();
  });
});

// ── Property test P8 ──────────────────────────────────────────────────────────

describe('Property 8 — Drawer submits exact selection as evidenceEventIds', () => {
  // Sample array lengths covering boundaries and typical values
  const sampleLengths: number[] = [0, 1, 2, 3, 5, 10, 20, 50, 100];

  // 30 pseudo-random lengths in [1, 200] for broader coverage (deterministic)
  const pseudoRandomLengths: number[] = Array.from({ length: 30 }, (_, i) => {
    return ((i * 97 + 7) % 200) + 1;
  });

  const allLengths = [...sampleLengths, ...pseudoRandomLengths];

  allLengths.forEach((n) => {
    it(`n=${n}: POST body.evidenceEventIds deep-equals selectedEventIds`, async () => {
      const ids = makeEventIds(n);
      renderDrawer({ selectedEventIds: ids, currentQuery: 'hunt query' });

      clickSubmit();

      await waitFor(() => {
        const body = capturedPostBody as CreateIncidentFromHuntRequest;
        expect(body).toBeDefined();
        expect(body.evidenceEventIds).toBeDefined();
        expect(body.evidenceEventIds).toHaveLength(ids.length);
        expect(body.evidenceEventIds).toEqual(ids);
        expect(capturedPostPath).toBe('/ha-incidents');
      });
    });
  });

  it('evidenceEventIds preserves IDs with special characters (exact values)', async () => {
    const ids = [
      'evt-abc/def',
      'evt-with spaces',
      'evt-unicode-日本語',
      'evt-dash---test',
      'evt-colon:value',
    ];
    renderDrawer({ selectedEventIds: ids, currentQuery: 'special chars test' });
    clickSubmit();

    await waitFor(() => {
      const body = capturedPostBody as CreateIncidentFromHuntRequest;
      expect(body.evidenceEventIds).toEqual(ids);
    });
  });

  it('evidenceEventIds preserves the exact insertion order (not sorted)', async () => {
    // Deliberately out-of-lexicographic order to confirm order is preserved verbatim
    const ids = ['zzz-999', 'aaa-001', 'mmm-500', 'bbb-002'];
    renderDrawer({ selectedEventIds: ids, currentQuery: 'order test' });
    clickSubmit();

    await waitFor(() => {
      const body = capturedPostBody as CreateIncidentFromHuntRequest;
      expect(body.evidenceEventIds).toEqual(['zzz-999', 'aaa-001', 'mmm-500', 'bbb-002']);
    });
  });

  it('POST body contains incidentStatus=1 and numeric incidentSeverity alongside evidenceEventIds', async () => {
    const ids = makeEventIds(3, 'field-check');
    renderDrawer({ selectedEventIds: ids, currentQuery: 'field validation' });
    clickSubmit();

    await waitFor(() => {
      const body = capturedPostBody as CreateIncidentFromHuntRequest;
      expect(body.incidentName).toBeTruthy();
      expect(body.incidentStatus).toBe(1);
      expect(typeof body.incidentSeverity).toBe('number');
      expect(body.evidenceEventIds).toEqual(ids);
    });
  });
});

// ── Property test P9 ──────────────────────────────────────────────────────────

/**
 * **Property 9: Drawer pre-fills incident name from non-empty query.**
 * **Validates: Requirements 4.9**
 *
 * For non-empty query strings Q, the incident name input is pre-filled with
 * `"Hunt: " + Q.trim()`.  For empty or whitespace-only Q, the name is
 * `"Hunt Investigation"`.
 */
describe('TestP9 — Drawer pre-fills incident name from non-empty query', () => {
  // Representative non-empty queries: [query, expectedName]
  const nonEmptyCases: [string, string][] = [
    ['EventID:4624',        'Hunt: EventID:4624'],
    ['  login failure  ',   'Hunt: login failure'],
    ['攻撃 detection',       'Hunt: 攻撃 detection'],
    ['source.ip:10.0.0.1',  'Hunt: source.ip:10.0.0.1'],
    ['  spaces on left',    'Hunt: spaces on left'],
    ['spaces on right  ',   'Hunt: spaces on right'],
  ];

  // Empty / whitespace-only queries all resolve to the fallback name
  const emptyCases: string[] = ['', '   ', '\t', '\n', '  \t  '];

  nonEmptyCases.forEach(([query, expectedName]) => {
    it(`non-empty query "${query}" → incident name is "${expectedName}"`, () => {
      renderDrawer({ currentQuery: query });

      // The input has aria-label / label "Incident Name"; find by display value
      // as a fallback because the label association goes through HaFormGroup.
      const input = screen.getByDisplayValue(expectedName) as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe(expectedName);
    });
  });

  emptyCases.forEach((query) => {
    it(`empty/whitespace query ${JSON.stringify(query)} → incident name is "Hunt Investigation"`, () => {
      renderDrawer({ currentQuery: query });

      const input = screen.getByDisplayValue('Hunt Investigation') as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe('Hunt Investigation');
    });
  });

  it('re-opening the drawer with a new query re-derives the incident name', () => {
    const { rerender, onClose } = renderDrawer({ currentQuery: 'first query', isOpen: true });

    // First render — name is "Hunt: first query"
    expect(screen.getByDisplayValue('Hunt: first query')).toBeDefined();

    // Simulate close → reopen with a different query
    rerender(
      <CreateIncidentFromHuntDrawer
        isOpen={false}
        onClose={onClose}
        selectedEventIds={[]}
        currentQuery="second query"
      />
    );
    rerender(
      <CreateIncidentFromHuntDrawer
        isOpen={true}
        onClose={onClose}
        selectedEventIds={[]}
        currentQuery="second query"
      />
    );

    expect(screen.getByDisplayValue('Hunt: second query')).toBeDefined();
  });

  it('re-opening with empty query after non-empty query resets to fallback', () => {
    const { rerender, onClose } = renderDrawer({ currentQuery: 'EventID:4625', isOpen: true });

    expect(screen.getByDisplayValue('Hunt: EventID:4625')).toBeDefined();

    rerender(
      <CreateIncidentFromHuntDrawer
        isOpen={false}
        onClose={onClose}
        selectedEventIds={[]}
        currentQuery=""
      />
    );
    rerender(
      <CreateIncidentFromHuntDrawer
        isOpen={true}
        onClose={onClose}
        selectedEventIds={[]}
        currentQuery=""
      />
    );

    expect(screen.getByDisplayValue('Hunt Investigation')).toBeDefined();
  });
});

// ── Property test P10 ─────────────────────────────────────────────────────────

/**
 * **Property 10: On successful incident creation, drawer navigates to `/incidents/<id>`.**
 * **Validates: Requirements 4.9**
 *
 * For various `id` values (numeric integer, string UUID, large number), when the
 * mutation succeeds with `{ id }`, assert that `navigate` was called with exactly
 * `"/incidents/<id>"`, and that `onClose` was called (the drawer closes on success).
 */
describe('TestP10 — Drawer navigates to /incidents/<id> on successful create', () => {
  // Each case: [description, id, expectedPath]
  const cases: [string, number | string, string][] = [
    ['small integer id=1',          1,              '/incidents/1'],
    ['integer id=42',               42,             '/incidents/42'],
    ['string UUID id',              'abc-123-uuid', '/incidents/abc-123-uuid'],
    ['large integer id=99999',      99999,          '/incidents/99999'],
  ];

  cases.forEach(([desc, id, expectedPath]) => {
    it(`${desc} → navigate called with "${expectedPath}" and onClose called`, async () => {
      // Re-import apiClient mock and update the post response for this specific id.
      const { apiClient: mockedApiClient } = await import('@/lib/apiClient');
      (mockedApiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id });

      const { onClose } = renderDrawer({
        selectedEventIds: ['evt-001'],
        currentQuery: 'test query',
      });

      clickSubmit();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(expectedPath);
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});
