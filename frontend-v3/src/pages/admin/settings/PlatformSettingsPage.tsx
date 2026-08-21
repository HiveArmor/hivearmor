/**
 * PlatformSettingsPage.tsx — Platform Settings (ADM-08)
 *
 * Tabs:
 *   - General  : platform name, timezone, auth/MFA settings
 *   - AI       : LLM provider configuration (Sprint 27, Requirements 7.4, 7.5)
 *
 * All colours via var(--ha-*) design tokens — no hex literals.
 * No `any` types.
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2 } from 'lucide-react';

import { SystemSettingsAiTab } from './tabs/SystemSettingsAiTab';

import { HaTabs } from '@/components/ha-tabs/HaTabs';
import { platformSettingsService } from '@/services/platformSettings.service';
import { useAuthStore } from '@/store/auth.store';
import type { PlatformSettingsDTO } from '@/types/platformSettings.types';

// ─── Tab types ─────────────────────────────────────────────────────────────

type SettingsTab = 'general' | 'ai';

const TABS: Array<{ key: SettingsTab; title: string }> = [
  { key: 'general', title: 'General' },
  { key: 'ai',      title: 'AI' },
];

// ─── General tab content ────────────────────────────────────────────────────

interface GeneralTabContentProps {
  formData: PlatformSettingsDTO;
  onChange: (data: PlatformSettingsDTO) => void;
  onSave: () => void;
  isSaving: boolean;
  saveStatus: 'idle' | 'success' | 'error';
  errorMessage: string | null;
  hasAdminRole: boolean;
}

function GeneralTabContent({
  formData,
  onChange,
  onSave,
  isSaving,
  saveStatus,
  errorMessage,
  hasAdminRole,
}: GeneralTabContentProps): JSX.Element {
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px' }}>
      {saveStatus === 'success' && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--ha-fill-low-muted)',
            border: '1px solid var(--ha-positive)',
            borderRadius: 'var(--ha-radius-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: 'var(--ha-text-primary)',
          }}
        >
          <Check size={20} style={{ color: 'var(--ha-positive)' }} />
          Settings saved successfully
        </div>
      )}

      {saveStatus === 'error' && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--ha-fill-critical-muted)',
            border: '1px solid var(--ha-critical)',
            borderRadius: 'var(--ha-radius-base)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: 'var(--ha-text-primary)',
          }}
        >
          <AlertCircle size={20} style={{ color: 'var(--ha-critical)' }} />
          {errorMessage ?? 'Failed to save settings'}
        </div>
      )}

      {/* General Settings */}
      <section
        style={{
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--ha-text-md)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            marginBottom: '16px',
          }}
        >
          General
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)' }}>
              Platform Name
            </span>
            <input
              type="text"
              value={formData.general.platformName}
              onChange={(e) =>
                onChange({
                  ...formData,
                  general: { ...formData.general, platformName: e.target.value },
                })
              }
              style={{
                padding: '8px 12px',
                background: 'var(--ha-background)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-base)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)' }}>
              Timezone
            </span>
            <input
              type="text"
              value={formData.general.timezone}
              onChange={(e) =>
                onChange({
                  ...formData,
                  general: { ...formData.general, timezone: e.target.value },
                })
              }
              style={{
                padding: '8px 12px',
                background: 'var(--ha-background)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-base)',
              }}
            />
          </label>
        </div>
      </section>

      {/* Auth Settings */}
      <section
        style={{
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--ha-text-md)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            marginBottom: '16px',
          }}
        >
          Authentication
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={formData.auth.mfaEnforced}
              onChange={(e) =>
                onChange({
                  ...formData,
                  auth: { ...formData.auth, mfaEnforced: e.target.checked },
                })
              }
            />
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)' }}>
              Enforce MFA
            </span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)' }}>
              Session Timeout (minutes)
            </span>
            <input
              type="number"
              value={formData.auth.sessionTimeoutMinutes}
              onChange={(e) =>
                onChange({
                  ...formData,
                  auth: { ...formData.auth, sessionTimeoutMinutes: parseInt(e.target.value, 10) },
                })
              }
              min={5}
              max={10080}
              style={{
                padding: '8px 12px',
                background: 'var(--ha-background)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-base)',
              }}
            />
          </label>
        </div>
      </section>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onSave}
          disabled={isSaving || !hasAdminRole}
          style={{
            padding: '10px 24px',
            background: isSaving ? 'var(--ha-border)' : 'var(--ha-primary)',
            color: 'var(--ha-background)',
            border: 'none',
            borderRadius: 'var(--ha-radius-base)',
            fontSize: 'var(--ha-text-base)',
            fontWeight: 600,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isSaving && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function PlatformSettingsPage() {
  const hasAdminRole = useAuthStore((state) => state.hasRole('ROLE_ADMIN'));
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [formData, setFormData] = useState<PlatformSettingsDTO | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platformSettings'],
    queryFn: platformSettingsService.getSettings,
  });

  useEffect(() => {
    if (data) {
      setFormData(data);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: platformSettingsService.updateSettings,
    onSuccess: (savedData) => {
      setFormData(savedData);
      setSaveStatus('success');
      setErrorMessage(null);
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: (err: Error) => {
      setSaveStatus('error');
      setErrorMessage(err.message);
    },
  });

  const handleSave = () => {
    if (formData && hasAdminRole) {
      saveMutation.mutate(formData);
    }
  };

  if (!hasAdminRole) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={48} style={{ color: 'var(--ha-high)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            You do not have permission to view platform settings.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '400px',
        }}
      >
        <Loader2 size={32} style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={48} style={{ color: 'var(--ha-critical)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            Error Loading Settings
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  const tabs = TABS.map((t) => ({
    key: t.key,
    title: t.title,
    content:
      t.key === 'general' ? (
        <GeneralTabContent
          formData={formData}
          onChange={setFormData}
          onSave={handleSave}
          isSaving={saveMutation.isPending}
          saveStatus={saveStatus}
          errorMessage={errorMessage}
          hasAdminRole={hasAdminRole}
        />
      ) : (
        <SystemSettingsAiTab />
      ),
  }));

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1
        style={{
          fontSize: 'var(--ha-text-xl)',
          fontWeight: 600,
          color: 'var(--ha-text-primary)',
          marginBottom: '24px',
        }}
      >
        Platform Settings
      </h1>

      <div
        style={{
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
        }}
      >
        <HaTabs
          tabs={tabs}
          activeKey={activeTab}
          onSelect={(key) => setActiveTab(key as SettingsTab)}
        />
      </div>
    </div>
  );
}
