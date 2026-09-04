/**
 * QueryBar — R3 one-row lane contract.
 *
 * Covers the two props added for the focus-driven query/NL lane:
 *  - expandSignal: when it changes (non-zero), Monaco must be re-measured (editor.layout()) and
 *    focused, because Monaco cannot size itself while the collapsed pane clips it.
 *  - onFocusChange: editor focus/blur must propagate to the parent so focus can drive activePane.
 *
 * We mock @monaco-editor/react with a fake editor that captures the onMount callbacks and the
 * focus/blur listeners, then drive them directly.
 */
import { render, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// --- Fake Monaco editor wired through onMount -------------------------------
const layout = vi.fn();
const focus = vi.fn();
let focusListener: (() => void) | null = null;
let blurListener: (() => void) | null = null;

const fakeEditor = {
  updateOptions: vi.fn(),
  getContentHeight: () => 38,
  onDidContentSizeChange: () => ({ dispose: vi.fn() }),
  onKeyDown: () => ({ dispose: vi.fn() }),
  addCommand: vi.fn(),
  onDidFocusEditorText: (cb: () => void) => { focusListener = cb; return { dispose: vi.fn() }; },
  onDidBlurEditorText: (cb: () => void) => { blurListener = cb; return { dispose: vi.fn() }; },
  getModel: () => null,
  setPosition: vi.fn(),
  layout,
  focus,
};

const fakeMonaco = {
  languages: {
    getLanguages: () => [{ id: 'hive-kql' }],
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
  },
  editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
  KeyCode: { DownArrow: 1, UpArrow: 2, Enter: 3, Tab: 4, Escape: 5 },
  KeyMod: { CtrlCmd: 0 },
};

vi.mock('@monaco-editor/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  return {
    Editor: ({ onMount }: { onMount?: (e: unknown, m: unknown) => void }) => {
      // Wire the editor ref + listeners AFTER commit, so QueryBar's own setState in onMount does not
      // run during the Editor's render pass.
      React.useEffect(() => { onMount?.(fakeEditor, fakeMonaco); }, [onMount]);
      return React.createElement('div', { 'data-testid': 'fake-monaco' });
    },
  };
});

// getComputedStyle is used by applyTheme(); jsdom provides a stub that returns ''.
import { QueryBar } from './QueryBar';

afterEach(() => {
  vi.clearAllMocks();
  focusListener = null;
  blurListener = null;
});

describe('QueryBar R3 lane contract', () => {
  it('does NOT layout/focus on initial mount (expandSignal starts at 0)', () => {
    render(<QueryBar value="" onChange={() => {}} onExecute={() => {}} expandSignal={0} />);
    // layout may be called by content-size wiring, but our expand effect must not focus on mount.
    expect(focus).not.toHaveBeenCalled();
  });

  it('re-measures and focuses Monaco when expandSignal changes to a non-zero value', () => {
    vi.useFakeTimers();
    // rAF runs the layout/focus; drive it via fake timers.
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0 as unknown as number;
    });

    const { rerender } = render(
      <QueryBar value="event.action:login" onChange={() => {}} onExecute={() => {}} expandSignal={0} />,
    );
    expect(focus).not.toHaveBeenCalled();

    act(() => {
      rerender(<QueryBar value="event.action:login" onChange={() => {}} onExecute={() => {}} expandSignal={1} />);
    });

    expect(layout).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();

    rafSpy.mockRestore();
    vi.useRealTimers();
  });

  it('propagates editor focus and blur to onFocusChange', () => {
    vi.useFakeTimers();
    const onFocusChange = vi.fn();
    render(<QueryBar value="" onChange={() => {}} onExecute={() => {}} onFocusChange={onFocusChange} />);

    // focus fires immediately
    act(() => { focusListener?.(); });
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    // blur is deferred by a 100ms timeout in QueryBar
    act(() => { blurListener?.(); vi.advanceTimersByTime(120); });
    expect(onFocusChange).toHaveBeenLastCalledWith(false);

    vi.useRealTimers();
  });
});
