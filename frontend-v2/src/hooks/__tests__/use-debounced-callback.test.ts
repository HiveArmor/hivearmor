import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Pure logic tests for debounce behaviour — no React rendering needed.
// We exercise the timing contract directly without the hook wrapper.

function makeDebounced<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return { debounced, cancel };
}

describe("debounce contract", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls fn once after the delay when invoked once", () => {
    const fn = vi.fn();
    const { debounced } = makeDebounced(fn, 1_000);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("coalesces 10 rapid calls into a single invocation", () => {
    const fn = vi.fn();
    const { debounced } = makeDebounced(fn, 1_000);

    for (let i = 0; i < 10; i++) debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not fire again if no new calls arrive before the timer", () => {
    const fn = vi.fn();
    const { debounced } = makeDebounced(fn, 1_000);

    debounced();
    vi.advanceTimersByTime(500);
    debounced();                    // resets the timer
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled(); // not yet — still 1ms short

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires again after a second burst separated by more than the delay", () => {
    const fn = vi.fn();
    const { debounced } = makeDebounced(fn, 1_000);

    debounced();
    vi.advanceTimersByTime(1_000);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel prevents the pending call from firing", () => {
    const fn = vi.fn();
    const { debounced, cancel } = makeDebounced(fn, 1_000);

    debounced();
    cancel();
    vi.advanceTimersByTime(2_000);
    expect(fn).not.toHaveBeenCalled();
  });
});

// Polling strategy: SSE-active vs SSE-error
describe("polling strategy (SSE-active suppresses interval)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not call loadAlerts via interval when SSE status is 'connected'", () => {
    const loadAlerts = vi.fn();
    let sseStatus: "connected" | "error" = "connected";
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    function applyStatus(status: typeof sseStatus) {
      sseStatus = status;
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
      if (sseStatus === "error") {
        fallbackInterval = setInterval(() => loadAlerts(), 30_000);
      }
    }

    applyStatus("connected");
    vi.advanceTimersByTime(90_000); // 3× 30s
    expect(loadAlerts).not.toHaveBeenCalled();

    if (fallbackInterval) clearInterval(fallbackInterval);
  });

  it("starts fallback polling when SSE status transitions to 'error'", () => {
    const loadAlerts = vi.fn();
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    function applyStatus(status: "connected" | "error") {
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
      if (status === "error") {
        fallbackInterval = setInterval(() => loadAlerts(), 30_000);
      }
    }

    applyStatus("connected");
    vi.advanceTimersByTime(30_000);
    expect(loadAlerts).toHaveBeenCalledTimes(0);

    applyStatus("error");
    vi.advanceTimersByTime(30_000);
    expect(loadAlerts).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(loadAlerts).toHaveBeenCalledTimes(2);

    if (fallbackInterval) clearInterval(fallbackInterval);
  });

  it("stops polling when SSE reconnects after an error", () => {
    const loadAlerts = vi.fn();
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    function applyStatus(status: "connected" | "error") {
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
      if (status === "error") {
        fallbackInterval = setInterval(() => loadAlerts(), 30_000);
      }
    }

    applyStatus("error");
    vi.advanceTimersByTime(30_000);
    expect(loadAlerts).toHaveBeenCalledTimes(1);

    applyStatus("connected"); // SSE recovered — clears the interval
    vi.advanceTimersByTime(90_000);
    expect(loadAlerts).toHaveBeenCalledTimes(1); // no new calls
  });
});
