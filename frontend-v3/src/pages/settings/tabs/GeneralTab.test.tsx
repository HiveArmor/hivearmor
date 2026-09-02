/**
 * GeneralTab tests — hydration, save payload, and validation.
 *
 * Requirements: 1.2, 3.1, 5, 6, 7
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralTab } from './GeneralTab';

import type { SystemSettings } from '@/types/systemSettings.types';

const mutate = vi.hoisted(() => vi.fn());
const useSystemSettingsMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSystemSettings', () => ({
  useSystemSettings: () => useSystemSettingsMock(),
  SYSTEM_SETTINGS_KEY: ['systemSettings'],
}));

vi.mock('@/hooks/useUpdateGeneralSettings', () => ({
  useUpdateGeneralSettings: () => ({
    mutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

const settings: SystemSettings = {
  general: { siteName: 'Acme SOC', timezone: 'Europe/London', defaultLocale: 'es' },
  email: { host: 'smtp.acme.test', port: 587, username: 'svc', password: '***', from: 'soc@acme.test', useTls: true },
  ai: { provider: 'openai', model: 'gpt-4o', endpoint: 'https://api.openai.com/v1', apiKey: '***', apiKeyTouched: false },
  security: { sessionTimeoutMinutes: 30, mfaRequired: false, passwordMinLength: 12 },
};

describe('GeneralTab', () => {
  beforeEach(() => {
    mutate.mockReset();
    useSystemSettingsMock.mockReturnValue({ data: settings });
  });

  it('hydrates fields from the GET response', () => {
    render(<GeneralTab />);
    expect(screen.getByLabelText('Site name')).toHaveValue('Acme SOC');
    expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/London');
    expect(screen.getByLabelText('Default locale')).toHaveValue('es');
  });

  it('saves the edited payload via the mutation', () => {
    render(<GeneralTab />);
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save general settings' }));
    expect(mutate).toHaveBeenCalledWith({
      siteName: 'New Name',
      timezone: 'Europe/London',
      defaultLocale: 'es',
    });
  });

  it('blocks Save and shows an error when the site name is empty', () => {
    render(<GeneralTab />);
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save general settings' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Site name is required/i)).toBeInTheDocument();
  });
});
