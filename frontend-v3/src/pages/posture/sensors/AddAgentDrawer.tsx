/**
 * AddAgentDrawer — One-click agent provisioning UX
 *
 * Two-step drawer:
 *   Step 1 (Form)   — admin enters alias, mode, and key expiry
 *   Step 2 (Script) — displays generated bash / PowerShell install scripts
 *                     with copy-to-clipboard and a security warning
 *
 * The raw connection key and scripts are cleared from React state when the
 * drawer closes — they are never stored beyond the current session.
 */

import { lazy, Suspense, useCallback, useRef, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Monitor, Server, Shield, ShieldAlert, Terminal } from 'lucide-react';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { createAgentKey } from '@/services/agentProvisioningService';
import { useThemeStore } from '@/store/theme.store';
import type { AgentKeyCreatedDTO, AgentMode } from '@/types/agentProvisioning.types';

// Lazy-load the Monaco editor — same pattern used in EndpointTimelinePage
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

// ── Constants ─────────────────────────────────────────────────────────────────

const ALIAS_REGEX = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

const EXPIRY_OPTIONS = [
  { value: 24,  label: '24 hours (recommended)' },
  { value: 48,  label: '48 hours' },
  { value: 168, label: '7 days' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ScriptTab = 'linux' | 'windows';

interface AddAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddAgentDrawer({ isOpen, onClose }: AddAgentDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const theme = useThemeStore((state) => state.theme);

  // Step 1 — form state
  const [alias, setAlias]         = useState('');
  const [mode, setMode]           = useState<AgentMode>('edr');
  const [expiresIn, setExpiresIn] = useState(24);
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Step 2 — result state (cleared on close)
  const [created, setCreated]   = useState<AgentKeyCreatedDTO | null>(null);
  const [activeTab, setActiveTab] = useState<ScriptTab>('linux');
  const [copied, setCopied]     = useState(false);
  const copyTimeoutRef          = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: createAgentKey,
    onSuccess: (data) => {
      setCreated(data);
      // Invalidate sensors list so the new agent appears once it registers.
      void queryClient.invalidateQueries({ queryKey: ['sensors'] });
    },
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateAlias = useCallback((value: string): string | null => {
    if (!value.trim()) return 'Agent name is required.';
    if (value.length > 63) return 'Name must be 63 characters or fewer.';
    if (!ALIAS_REGEX.test(value)) {
      return 'Use only lowercase letters (a–z), digits (0–9), and hyphens (–). '
        + 'Must start and end with a letter or digit.';
    }
    return null;
  }, []);

  const handleAliasChange = (value: string) => {
    setAlias(value);
    setAliasError(validateAlias(value));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    const err = validateAlias(alias);
    if (err) {
      setAliasError(err);
      return;
    }
    mutation.mutate({ alias: alias.trim(), mode, expiresIn });
  };

  // ── Copy to clipboard ──────────────────────────────────────────────────────

  const handleCopy = () => {
    const script = activeTab === 'linux' ? created?.bashScript : created?.powershellScript;
    if (!script) return;
    void navigator.clipboard.writeText(script);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2500);
  };

  // ── Close / reset ──────────────────────────────────────────────────────────

  const handleClose = () => {
    // Clear sensitive data from React state before closing.
    setCreated(null);
    setAlias('');
    setMode('edr');
    setExpiresIn(24);
    setAliasError(null);
    setCopied(false);
    mutation.reset();
    onClose();
  };

  // ── Active script text ─────────────────────────────────────────────────────

  const activeScript = created
    ? activeTab === 'linux'
      ? created.bashScript
      : created.powershellScript
    : '';

  const monacoLanguage = activeTab === 'linux' ? 'shell' : 'powershell';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <HaDrawer
      isOpen={isOpen}
      onClose={handleClose}
      title={created ? `Agent "${created.alias}" ready` : 'Add Agent'}
      subtitle={created ? undefined : 'Generate a one-click install script'}
      width={680}
      footer={
        created ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px' }}>
            <HaButton variant="primary" onClick={handleClose}>
              Done
            </HaButton>
          </div>
        ) : undefined
      }
    >
      {!created ? (
        // ── Step 1: Form ──────────────────────────────────────────────────────
        <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Agent name field */}
          <div>
            <label style={labelStyle}>
              Agent name <span style={{ color: 'var(--ha-critical)' }}>*</span>
            </label>
            <p style={hintStyle}>
              A unique, human-readable name for this machine (e.g. <code style={codeStyle}>web-server-01</code>,{' '}
              <code style={codeStyle}>dc-london-01</code>). Lowercase letters, digits, and hyphens only.
            </p>
            <input
              type="text"
              value={alias}
              onChange={e => handleAliasChange(e.target.value)}
              placeholder="e.g. web-server-01"
              maxLength={63}
              autoFocus
              style={{
                ...inputStyle,
                borderColor: aliasError ? 'var(--ha-critical)' : 'var(--ha-border)',
              }}
            />
            {aliasError && (
              <p style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-critical)', marginTop: 4 }}>
                {aliasError}
              </p>
            )}
            {mutation.error && (
              <p style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-critical)', marginTop: 4 }}>
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : 'An error occurred. Please try again.'}
              </p>
            )}
          </div>

          {/* Mode selection */}
          <div>
            <label style={labelStyle}>Installation mode</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <ModeCard
                selected={mode === 'log'}
                onClick={() => setMode('log')}
                icon={<Server size={20} />}
                title="Log Only"
                description="Collects syslog, netflow, and file logs. Low overhead (~25 MB RAM). Best for network devices and servers."
              />
              <ModeCard
                selected={mode === 'edr'}
                onClick={() => setMode('edr')}
                icon={<Shield size={20} />}
                title="Log + EDR"
                description="Full endpoint telemetry: process, file, network, DNS, USB events. Recommended for workstations and critical servers."
                badge="Recommended"
              />
            </div>
          </div>

          {/* Key expiry */}
          <div>
            <label style={labelStyle}>Script expiry</label>
            <p style={hintStyle}>
              The install script contains a one-time connection key. After this period the key expires
              and cannot be used to register new agents.
            </p>
            <select
              value={expiresIn}
              onChange={e => setExpiresIn(Number(e.target.value))}
              style={selectStyle}
            >
              {EXPIRY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Generate button */}
          <div style={{ paddingBottom: 24 }}>
            <HaButton
              variant="primary"
              onClick={handleGenerate}
              isLoading={mutation.isPending}
              disabled={!alias.trim() || !!aliasError || mutation.isPending}
            >
              Generate install script
            </HaButton>
          </div>
        </div>
      ) : (
        // ── Step 2: Script display ────────────────────────────────────────────
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Key info bar */}
          <div style={{
            display: 'flex',
            gap: 16,
            padding: '12px 24px',
            borderBottom: '1px solid var(--ha-border)',
            flexWrap: 'wrap',
          }}>
            <InfoChip label="Mode" value={created.mode === 'edr' ? 'Log + EDR' : 'Log Only'} />
            <InfoChip label="Server" value={created.serverHost} />
            <InfoChip
              label="Key expires"
              value={new Date(created.expiresAt).toLocaleString()}
              warn={true}
            />
          </div>

          {/* Security warning */}
          <div style={{ padding: '12px 24px 0' }}>
            <HaInlineBanner
              variant="warning"
              title="Security notice"
              description="This script contains your one-time connection key. Treat it like a password — do not share it, log it, or commit it to version control. The key is shown only once."
              isDismissible={false}
            />
          </div>

          {/* OS tabs */}
          <div style={{ padding: '16px 24px 0' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--ha-border)' }}>
              <TabButton
                active={activeTab === 'linux'}
                onClick={() => { setActiveTab('linux'); setCopied(false); }}
                icon={<Terminal size={14} />}
                label="Linux / macOS"
              />
              <TabButton
                active={activeTab === 'windows'}
                onClick={() => { setActiveTab('windows'); setCopied(false); }}
                icon={<Monitor size={14} />}
                label="Windows"
              />
            </div>
          </div>

          {/* Script editor */}
          <div style={{ flex: 1, minHeight: 320, padding: '0 24px', position: 'relative' }}>
            <Suspense
              fallback={
                <pre style={{
                  flex: 1,
                  background: 'var(--ha-background)',
                  color: 'var(--ha-text-primary)',
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-xs)',
                  padding: 16,
                  borderRadius: 'var(--ha-radius-base)',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  border: '1px solid var(--ha-border)',
                  margin: '8px 0',
                  height: 320,
                }}>
                  {activeScript}
                </pre>
              }
            >
              <div style={{ height: 320, marginTop: 8, borderRadius: 'var(--ha-radius-base)', overflow: 'hidden', border: '1px solid var(--ha-border)' }}>
                <MonacoEditor
                  height="320px"
                  language={monacoLanguage}
                  value={activeScript}
                  theme={`hivearmor-${theme}`}
                  beforeMount={defineHiveArmorMonacoTheme}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 12,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    contextmenu: false,
                    renderLineHighlight: 'none',
                    scrollbar: { vertical: 'auto', horizontal: 'hidden' },
                  }}
                />
              </div>
            </Suspense>
          </div>

          {/* Copy + ports note */}
          <div style={{ padding: '12px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <HaButton
                variant="primary"
                icon={copied ? <Check size={16} /> : <Copy size={16} />}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : `Copy ${activeTab === 'linux' ? 'bash' : 'PowerShell'} script`}
              </HaButton>

              {activeTab === 'linux' && (
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                  Run as root on the target machine
                </span>
              )}
              {activeTab === 'windows' && (
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                  Run in an elevated PowerShell window
                </span>
              )}
            </div>

            {/* Port requirements */}
            <div style={{
              padding: '10px 12px',
              background: 'var(--ha-surface-raised)',
              borderRadius: 'var(--ha-radius-base)',
              border: '1px solid var(--ha-border)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <ShieldAlert size={14} style={{ flexShrink: 0, color: 'var(--ha-medium)' }} />
              <span>
                Ensure outbound ports{' '}
                <code style={codeStyle}>443</code>,{' '}
                <code style={codeStyle}>50051</code>, and{' '}
                <code style={codeStyle}>9000</code>{' '}
                are open to <strong>{created.serverHost}</strong> on the target machine.
              </span>
            </div>
          </div>
        </div>
      )}
    </HaDrawer>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ModeCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

function ModeCard({ selected, onClick, icon, title, description, badge }: ModeCardProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '14px 16px',
        textAlign: 'left',
        background: selected ? 'color-mix(in srgb, var(--ha-primary) 8%, transparent)' : 'var(--ha-surface-raised)',
        border: `2px solid ${selected ? 'var(--ha-primary)' : 'var(--ha-border)'}`,
        borderRadius: 'var(--ha-radius-base)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s ease',
      }}
      aria-pressed={selected}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: selected ? 'var(--ha-primary)' : 'var(--ha-text-secondary)' }}>
          {icon}
        </span>
        <span style={{ fontWeight: 600, fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-primary)' }}>
          {title}
        </span>
        {badge && (
          <span style={{
            fontSize: 'var(--ha-text-xs)',
            background: 'color-mix(in srgb, var(--ha-primary) 15%, transparent)',
            color: 'var(--ha-primary)',
            padding: '1px 6px',
            borderRadius: 'var(--ha-radius-sm)',
            fontWeight: 600,
          }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', margin: 0, lineHeight: 1.5 }}>
        {description}
      </p>
    </button>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        fontSize: 'var(--ha-text-sm)',
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--ha-primary)' : 'var(--ha-text-secondary)',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--ha-primary)' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: -1,
        transition: 'color 0.15s ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface InfoChipProps {
  label: string;
  value: string;
  warn?: boolean;
}

function InfoChip({ label, value, warn = false }: InfoChipProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--ha-text-sm)', fontWeight: 500, color: warn ? 'var(--ha-high)' : 'var(--ha-text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--ha-text-sm)',
  fontWeight: 600,
  color: 'var(--ha-text-primary)',
  marginBottom: 4,
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--ha-text-xs)',
  color: 'var(--ha-text-secondary)',
  margin: '0 0 8px',
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 'var(--ha-text-base)',
  fontFamily: 'var(--ha-font-mono)',
  color: 'var(--ha-text-primary)',
  background: 'var(--ha-surface-raised)',
  border: '1px solid var(--ha-border)',
  borderRadius: 'var(--ha-radius-base)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 'var(--ha-text-sm)',
  color: 'var(--ha-text-primary)',
  background: 'var(--ha-surface-raised)',
  border: '1px solid var(--ha-border)',
  borderRadius: 'var(--ha-radius-base)',
  outline: 'none',
  cursor: 'pointer',
  marginTop: 8,
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--ha-font-mono)',
  fontSize: '0.9em',
  background: 'var(--ha-surface-raised)',
  padding: '1px 5px',
  borderRadius: 'var(--ha-radius-sm)',
  border: '1px solid var(--ha-border)',
};
