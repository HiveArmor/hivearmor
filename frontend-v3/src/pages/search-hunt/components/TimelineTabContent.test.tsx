/**
 * TimelineTabContent component tests
 *
 * Tests:
 *   a) isLoading=true → renders loading state
 *   b) events=[], isLoading=false, isError=false → renders empty state
 *   c) isError=true → renders error state
 *   d) clicking a point invokes onEventClick with the underlying TimelineEventDTO
 *
 * HaChart is mocked because ECharts / canvas APIs are unavailable in jsdom.
 * The mock captures the onChartClick prop so we can simulate scatter-point clicks.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TimelineTabContent } from './TimelineTabContent';

import type { TimelineEventDTO } from '@/types/search';

// ---------------------------------------------------------------------------
// Mock HaChart — captures the onChartClick prop for programmatic invocation
// ---------------------------------------------------------------------------

// Use a module-level variable so individual tests can retrieve the captured handler.
let capturedOnChartClick: ((params: unknown) => void) | undefined;

vi.mock('@/components/ha-chart', () => ({
  HaChart: (props: { onChartClick?: (params: unknown) => void }) => {
    capturedOnChartClick = props.onChartClick;
    return <div data-testid="ha-chart-mock" />;
  },
}));

// ---------------------------------------------------------------------------
// Import component is declared above with the other imports per import/order rule.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixture helpers — no hex colour literals
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TimelineEventDTO> = {}): TimelineEventDTO {
  return {
    id: 'evt-001',
    timestamp: '2026-07-25T12:00:00.000Z',
    eventType: 'process_creation',
    severity: 2,
    dataType: 'windows',
    ...overrides,
  };
}

const noop = () => undefined;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimelineTabContent', () => {
  beforeEach(() => {
    capturedOnChartClick = undefined;
  });

  // (a) Loading state
  it('renders loading message when isLoading is true', () => {
    render(
      <TimelineTabContent
        events={[]}
        isLoading={true}
        isError={false}
        onEventClick={noop}
      />
    );

    // LoadingState renders the message prop as visible text
    expect(screen.getByText('Loading timeline events…')).toBeDefined();
  });

  // (b) Empty state
  it('renders empty state when events is empty and not loading or error', () => {
    render(
      <TimelineTabContent
        events={[]}
        isLoading={false}
        isError={false}
        onEventClick={noop}
      />
    );

    // EmptyState renders the title prop in an <h3>
    expect(screen.getByText('No timeline events')).toBeDefined();
  });

  // (c) Error state
  it('renders error state when isError is true', () => {
    render(
      <TimelineTabContent
        events={[]}
        isLoading={false}
        isError={true}
        onEventClick={noop}
      />
    );

    // ErrorState renders the title prop in an <h3>; role="alert" is set on the wrapper
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Failed to load timeline')).toBeDefined();
  });

  // (d) Click on chart point invokes onEventClick with the correct DTO
  it('calls onEventClick with the underlying TimelineEventDTO when a chart point is clicked', () => {
    const dto = makeEvent({ id: 'click-test-evt', eventType: 'network_connection', severity: 3 });
    const onEventClick = vi.fn();

    render(
      <TimelineTabContent
        events={[dto]}
        isLoading={false}
        isError={false}
        onEventClick={onEventClick}
      />
    );

    // The mocked HaChart should have been rendered and captured the click handler
    expect(screen.getByTestId('ha-chart-mock')).toBeDefined();
    expect(capturedOnChartClick).toBeDefined();

    // Simulate a scatter-point click: ECharts delivers a params object with `data._raw`
    const fakeParams = { data: { value: [Date.now(), 0], _raw: dto } };
    if (capturedOnChartClick) {
      capturedOnChartClick(fakeParams);
    }

    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick).toHaveBeenCalledWith(dto);
  });
});
