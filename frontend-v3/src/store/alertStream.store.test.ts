/**
 * Alert Stream Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { useAlertStreamStore, type AlertStreamEvent } from './alertStream.store';

describe('useAlertStreamStore', () => {
  const mockEvent: AlertStreamEvent = {
    id: '1',
    severity: 'high',
    title: 'Test Alert',
    timestamp: '2026-07-23T10:00:00Z',
    tenant: 'test-tenant',
  };

  beforeEach(() => {
    useAlertStreamStore.setState({
      connected: false,
      events: [],
      newAlertCount: 0,
      latestEvent: null,
    });
  });

  it('initializes with default state', () => {
    const state = useAlertStreamStore.getState();
    expect(state.connected).toBe(false);
    expect(state.events).toEqual([]);
    expect(state.newAlertCount).toBe(0);
    expect(state.latestEvent).toBeNull();
  });

  it('setConnected updates connection state', () => {
    const { setConnected } = useAlertStreamStore.getState();
    setConnected(true);
    expect(useAlertStreamStore.getState().connected).toBe(true);

    setConnected(false);
    expect(useAlertStreamStore.getState().connected).toBe(false);
  });

  it('addEvent adds event to the beginning of events array and sets latestEvent', () => {
    const { addEvent } = useAlertStreamStore.getState();
    addEvent(mockEvent);

    const state = useAlertStreamStore.getState();
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toEqual(mockEvent);
    expect(state.newAlertCount).toBe(1);
    expect(state.latestEvent).toEqual(mockEvent);
  });

  it('addEvent increments newAlertCount', () => {
    const { addEvent } = useAlertStreamStore.getState();
    addEvent(mockEvent);
    addEvent({ ...mockEvent, id: '2' });
    addEvent({ ...mockEvent, id: '3' });

    const state = useAlertStreamStore.getState();
    expect(state.newAlertCount).toBe(3);
  });

  it('addEvent caps events array at 100 most recent', () => {
    const { addEvent } = useAlertStreamStore.getState();

    // Add 110 events
    for (let i = 0; i < 110; i++) {
      addEvent({ ...mockEvent, id: `event-${i}` });
    }

    const state = useAlertStreamStore.getState();
    expect(state.events).toHaveLength(100);
    // Most recent event should be at index 0
    expect(state.events[0].id).toBe('event-109');
    // Oldest retained event should be at index 99
    expect(state.events[99].id).toBe('event-10');
  });

  it('clearNewAlertCount resets count to zero', () => {
    const { addEvent, clearNewAlertCount } = useAlertStreamStore.getState();
    addEvent(mockEvent);
    addEvent({ ...mockEvent, id: '2' });

    expect(useAlertStreamStore.getState().newAlertCount).toBe(2);

    clearNewAlertCount();
    expect(useAlertStreamStore.getState().newAlertCount).toBe(0);
  });

  it('clearNewAlertCount does not affect events array', () => {
    const { addEvent, clearNewAlertCount } = useAlertStreamStore.getState();
    addEvent(mockEvent);
    addEvent({ ...mockEvent, id: '2' });

    clearNewAlertCount();

    const state = useAlertStreamStore.getState();
    expect(state.events).toHaveLength(2);
    expect(state.newAlertCount).toBe(0);
  });

  it('maintains events array in LIFO order', () => {
    const { addEvent } = useAlertStreamStore.getState();

    const event1 = { ...mockEvent, id: 'first' };
    const event2 = { ...mockEvent, id: 'second' };
    const event3 = { ...mockEvent, id: 'third' };

    addEvent(event1);
    addEvent(event2);
    addEvent(event3);

    const state = useAlertStreamStore.getState();
    expect(state.events[0].id).toBe('third');
    expect(state.events[1].id).toBe('second');
    expect(state.events[2].id).toBe('first');
  });
});
