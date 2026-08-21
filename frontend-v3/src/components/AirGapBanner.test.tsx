/**
 * AirGapBanner unit tests
 *
 * Validates: Requirements 11.3, 11.4, 11.5, 11.7, 11.11, 11.12, 11.13
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AirGapBanner } from './AirGapBanner';
import { useSystemInfoStore } from '../store/systemInfoStore';

describe('AirGapBanner', () => {
  beforeEach(() => {
    // Reset the store to defaults before each test
    useSystemInfoStore.setState({
      appName: null,
      version: null,
      airGapMode: false,
      osVersion: null,
      javaVersion: null,
      isLoaded: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with role="alert" and expected text when airGapMode=true', () => {
    useSystemInfoStore.setState({ airGapMode: true, isLoaded: true });

    render(<AirGapBanner />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'polite');
    expect(alert).toHaveTextContent(
      'Air-gap mode active. External integrations (threat intel, email) are disabled.'
    );
  });

  it('renders null when airGapMode=false', () => {
    useSystemInfoStore.setState({ airGapMode: false, isLoaded: true });

    const { container } = render(<AirGapBanner />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.innerHTML).toBe('');
  });

  it('dismiss click hides the banner within the same render tree', () => {
    useSystemInfoStore.setState({ airGapMode: true, isLoaded: true });

    render(<AirGapBanner />);

    // Banner is visible
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Click dismiss
    const dismissButton = screen.getByLabelText('Dismiss air-gap notice');
    fireEvent.click(dismissButton);

    // Banner is hidden
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rendered DOM text does not contain emoji characters', () => {
    useSystemInfoStore.setState({ airGapMode: true, isLoaded: true });

    render(<AirGapBanner />);

    const alert = screen.getByRole('alert');
    const textContent = alert.textContent ?? '';
    // Unicode Extended_Pictographic regex — catches emoji
    expect(textContent).not.toMatch(/[\p{Extended_Pictographic}]/u);
  });

  it('Storage.prototype.setItem is not called during render or dismiss', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    useSystemInfoStore.setState({ airGapMode: true, isLoaded: true });

    render(<AirGapBanner />);

    // Click dismiss
    const dismissButton = screen.getByLabelText('Dismiss air-gap notice');
    fireEvent.click(dismissButton);

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
