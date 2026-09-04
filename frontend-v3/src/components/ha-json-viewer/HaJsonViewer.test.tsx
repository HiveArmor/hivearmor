import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HaJsonViewer } from './HaJsonViewer';

describe('HaJsonViewer', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders each JSON type with its dedicated token class (never severity/intel)', () => {
    const { container } = render(
      <HaJsonViewer data={{ name: 'evt', count: 3, ok: true, note: null }} />,
    );
    expect(container.querySelector('.ha-json-viewer__token--key')).toBeTruthy();
    expect(container.querySelector('.ha-json-viewer__token--string')).toBeTruthy();
    expect(container.querySelector('.ha-json-viewer__token--number')).toBeTruthy();
    expect(container.querySelector('.ha-json-viewer__token--boolean')).toBeTruthy();
    expect(container.querySelector('.ha-json-viewer__token--null')).toBeTruthy();
    // No borrowed semantic classes leaked in.
    expect(container.querySelector('[class*="severity"]')).toBeNull();
    expect(container.querySelector('[class*="intelligence"]')).toBeNull();
  });

  it('is XSS-safe: HTML in values is rendered as text, not markup', () => {
    const { container } = render(<HaJsonViewer data={{ payload: '<img src=x onerror=alert(1)>' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('collapses and expands an object node', () => {
    render(<HaJsonViewer data={{ nested: { a: 1, b: 2 } }} />);
    const toggles = screen.getAllByRole('button', { name: /Collapse|Expand/ });
    // The nested object provides a collapse toggle.
    const nestedToggle = toggles.find((b) => b.getAttribute('aria-label') === 'Collapse');
    expect(nestedToggle).toBeTruthy();
    if (!nestedToggle) return;
    fireEvent.click(nestedToggle);
    expect(screen.getByText(/…\d+ keys/)).toBeTruthy();
  });

  it('copies the JSON to the clipboard', () => {
    render(<HaJsonViewer data={{ a: 1 }} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy JSON to clipboard/ }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ a: 1 }, null, 2));
  });
});
