/**
 * EmailTab tests — hydration, password preserve/edit semantics, validation,
 * and the SMTP test-send button.
 *
 * Requirements: 1.2, 3.2, 4, 5, 6, 7
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmailTab } from './EmailTab';

import type { SystemSettings } from '@/types/systemSettings.types';

const mutate = vi.hoisted(() => vi.fn());
const sendTest = vi.hoisted(() => vi.fn());
const useSystemSettingsMock = vi.hoisted(() => vi.fn());
const useSendTestEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSystemSettings', () => ({
  useSystemSettings: () => useSystemSettingsMock(),
  SYSTEM_SETTINGS_KEY: ['systemSettings'],
}));

vi.mock('@/hooks/useUpdateEmailSettings', () => ({
  useUpdateEmailSettings: () => ({
    mutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSendTestEmail', () => ({
  useSendTestEmail: () => useSendTestEmailMock(),
}));

const settings: SystemSettings = {
  general: { siteName: 'Acme SOC', timezone: 'UTC', defaultLocale: 'en' },
  email: { host: 'smtp.acme.test', port: 587, username: 'svc', password: '***', from: 'soc@acme.test', useTls: true },
  ai: { provider: 'openai', model: 'gpt-4o', endpoint: 'https://api.openai.com/v1', apiKey: '***', apiKeyTouched: false },
  security: { sessionTimeoutMinutes: 30, mfaRequired: false, passwordMinLength: 12 },
};

function baseTestHook(overrides: Record<string, unknown> = {}): void {
  useSendTestEmailMock.mockReturnValue({
    mutate: sendTest,
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
    ...overrides,
  });
}

describe('EmailTab', () => {
  beforeEach(() => {
    mutate.mockReset();
    sendTest.mockReset();
    useSystemSettingsMock.mockReturnValue({ data: settings });
    baseTestHook();
  });

  it('hydrates fields from the GET response', () => {
    render(<EmailTab />);
    expect(screen.getByLabelText('SMTP host')).toHaveValue('smtp.acme.test');
    expect(screen.getByLabelText('SMTP port')).toHaveValue(587);
    expect(screen.getByLabelText('SMTP username')).toHaveValue('svc');
    expect(screen.getByLabelText('From address')).toHaveValue('soc@acme.test');
    expect(screen.getByLabelText('SMTP password')).toHaveValue('***');
  });

  it('preserves the password by sending "***" when it is not edited', () => {
    render(<EmailTab />);
    fireEvent.change(screen.getByLabelText('SMTP host'), { target: { value: 'smtp.new.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.new.test', password: '***' }),
    );
  });

  it('sends the new password when the field is edited', () => {
    render(<EmailTab />);
    fireEvent.change(screen.getByLabelText('SMTP password'), { target: { value: 'new-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'new-secret' }),
    );
  });

  it('blocks Save and shows an error when the From address is invalid', () => {
    render(<EmailTab />);
    fireEvent.change(screen.getByLabelText('From address'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/valid From address is required/i)).toBeInTheDocument();
  });

  it('calls sendTestEmail with the recipient (defaulted to the From address)', () => {
    render(<EmailTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
    expect(sendTest).toHaveBeenCalledWith('soc@acme.test');
  });

  it('renders a success banner when the test-send succeeds', () => {
    baseTestHook({ data: { ok: true } });
    render(<EmailTab />);
    expect(screen.getByText('Test email sent')).toBeInTheDocument();
    expect(screen.getByText(/Test email sent to soc@acme.test/)).toBeInTheDocument();
  });

  it('renders a danger banner with the sanitized error when the test-send fails', () => {
    baseTestHook({ data: { ok: false, error: 'Connection refused' } });
    render(<EmailTab />);
    expect(screen.getByText('Test email failed')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });
});
