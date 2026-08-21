/**
 * Unit tests for LlmUnavailableCard and LlmUnavailableErrorStrip.
 *
 * Verifies:
 *  - Card renders with the correct aria-label and descriptive text.
 *  - ErrorStrip renders with role="alert" and the expected message.
 *  - Custom description/message overrides are respected.
 *  - Neither component crashes the surrounding page (surrounding page mounted
 *    check via parent element).
 *
 * Requirements: 8.3, 10.6
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { LlmUnavailableCard, LlmUnavailableErrorStrip } from './LlmUnavailableCard';

// ---------------------------------------------------------------------------
// LlmUnavailableCard
// ---------------------------------------------------------------------------

describe('LlmUnavailableCard', () => {
  it('renders with role="status" and accessible label', () => {
    render(<LlmUnavailableCard />);
    const card = screen.getByRole('status', { name: /ai unavailable/i });
    expect(card).toBeTruthy();
  });

  it('renders the default title text', () => {
    render(<LlmUnavailableCard />);
    expect(screen.getByText(/ai provider unavailable/i)).toBeTruthy();
  });

  it('renders the default description', () => {
    render(<LlmUnavailableCard />);
    expect(
      screen.getByText(/ask an administrator to configure an ai provider/i),
    ).toBeTruthy();
  });

  it('renders a custom description when provided', () => {
    render(<LlmUnavailableCard description="Custom degraded message." />);
    expect(screen.getByText('Custom degraded message.')).toBeTruthy();
    expect(screen.queryByText(/ask an administrator/i)).toBeNull();
  });

  it('does not crash the surrounding parent element', () => {
    const { container } = render(
      <div data-testid="surrounding-page">
        <LlmUnavailableCard />
      </div>,
    );
    // Parent must still be in the DOM
    expect(container.querySelector('[data-testid="surrounding-page"]')).not.toBeNull();
    // Card is mounted inside it
    expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// LlmUnavailableErrorStrip
// ---------------------------------------------------------------------------

describe('LlmUnavailableErrorStrip', () => {
  it('renders with role="alert"', () => {
    render(<LlmUnavailableErrorStrip />);
    const strip = screen.getByRole('alert');
    expect(strip).toBeTruthy();
  });

  it('renders the default error message', () => {
    render(<LlmUnavailableErrorStrip />);
    expect(screen.getByText(/ai service is not available.*503/i)).toBeTruthy();
  });

  it('renders a custom message when provided', () => {
    render(<LlmUnavailableErrorStrip message="LLM offline." />);
    expect(screen.getByText('LLM offline.')).toBeTruthy();
    expect(screen.queryByText(/503/i)).toBeNull();
  });

  it('has aria-live="polite" for screen-reader announcement', () => {
    render(<LlmUnavailableErrorStrip />);
    const strip = screen.getByRole('alert');
    expect(strip.getAttribute('aria-live')).toBe('polite');
  });
});

// ---------------------------------------------------------------------------
// Combined usage — card + strip together
// ---------------------------------------------------------------------------

describe('LlmUnavailableCard + LlmUnavailableErrorStrip combined', () => {
  it('both render without crashing and surrounding page stays mounted', () => {
    const { container } = render(
      <div data-testid="page-root">
        <div data-testid="other-content">Other page content</div>
        <div data-testid="ai-panel">
          <LlmUnavailableErrorStrip />
          <LlmUnavailableCard />
        </div>
      </div>,
    );

    // Surrounding page elements still mounted
    expect(container.querySelector('[data-testid="page-root"]')).not.toBeNull();
    expect(screen.getByTestId('other-content')).toBeTruthy();

    // Both AI degradation elements present
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('status', { name: /ai unavailable/i })).toBeTruthy();
  });
});
