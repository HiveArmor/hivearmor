import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { useDocumentTitle, APP_TITLE } from './useDocumentTitle';

describe('useDocumentTitle', () => {
  beforeEach(() => {
    document.title = 'initial';
  });

  it('sets "<page> — HiveArmor"', () => {
    renderHook(() => useDocumentTitle('Alerts'));
    expect(document.title).toBe(`Alerts — ${APP_TITLE}`);
  });

  it('shows just the app name for an empty title', () => {
    renderHook(() => useDocumentTitle(''));
    expect(document.title).toBe(APP_TITLE);
  });

  it('restores the previous title on unmount', () => {
    const { unmount } = renderHook(() => useDocumentTitle('Incidents'));
    expect(document.title).toBe(`Incidents — ${APP_TITLE}`);
    unmount();
    expect(document.title).toBe('initial');
  });

  it('updates when the title changes', () => {
    const { rerender } = renderHook(({ t }) => useDocumentTitle(t), {
      initialProps: { t: 'One' },
    });
    expect(document.title).toBe(`One — ${APP_TITLE}`);
    rerender({ t: 'Two' });
    expect(document.title).toBe(`Two — ${APP_TITLE}`);
  });
});
