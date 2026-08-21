/**
 * RuleTestingPage.tsx — Sigma rule testing sandbox (T06, Req 6.13–6.17, 6.20).
 *
 * Route: /admin/rules/test
 *
 * Layout:
 *   - Left column:  Monaco YAML editor labelled "Detection Rule"
 *   - Right column: Monaco JSON editor labelled "Test Event (JSON)"
 *                   + "Load Sample Event" PatternFly FormSelect
 *   - "Run Test" button triggers useMutation → testRule
 *   - Result panel: CheckCircleIcon / TimesCircleIcon + matched-field chips
 *
 * Zero hard-coded hex colours (var(--ha-*) tokens only).
 * Zero `any` types.
 */

import { lazy, Suspense, useState } from 'react';

import {
  FormSelect,
  FormSelectOption,
  Spinner,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons';
import { useMutation } from '@tanstack/react-query';

import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { testRule } from '@/services/sigmaService';
import { useThemeStore } from '@/store/theme.store';
import type { RuleTestResultDTO } from '@/types/sigma';

// Lazy-load Monaco to avoid blocking the initial bundle
const Editor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Predefined sample events (Req 6.14)
// ---------------------------------------------------------------------------

interface SampleEvent {
  label: string;
  value: string;
}

const SAMPLE_EVENTS: SampleEvent[] = [
  {
    label: 'Windows Logon',
    value: JSON.stringify(
      {
        EventID: '4624',
        LogonType: '3',
        TargetUserName: 'admin',
        IpAddress: '192.168.1.100',
      },
      null,
      2,
    ),
  },
  {
    label: 'PowerShell Execution',
    value: JSON.stringify(
      {
        Image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        CommandLine: 'powershell.exe -enc SGVsbG8=',
        User: 'DOMAIN\\user',
      },
      null,
      2,
    ),
  },
  {
    label: 'Network Connection',
    value: JSON.stringify(
      {
        DestinationIp: '192.168.1.200',
        DestinationPort: '443',
        Protocol: 'tcp',
        SourceIp: '10.0.0.5',
      },
      null,
      2,
    ),
  },
  {
    label: 'DNS Query',
    value: JSON.stringify(
      {
        QueryName: 'malicious.example.com',
        QueryType: 'A',
        SourceIp: '10.0.0.5',
      },
      null,
      2,
    ),
  },
];

// ---------------------------------------------------------------------------
// Default rule template
// ---------------------------------------------------------------------------

const DEFAULT_RULE_YAML = `title: Example Rule
status: experimental
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: '4624'
    LogonType: '3'
  condition: selection
level: medium
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RuleTestingPage(): JSX.Element {
  const appearance = useThemeStore((state) => state.theme);
  const [ruleYaml, setRuleYaml] = useState<string>(DEFAULT_RULE_YAML);
  const [eventJson, setEventJson] = useState<string>(SAMPLE_EVENTS[0].value);
  const [selectedSample, setSelectedSample] = useState<string>('');
  const [monacoLoaded, setMonacoLoaded] = useState<boolean>(false);

  const handleMonacoBeforeMount = (
    monaco: typeof import('monaco-editor'),
  ): void => {
    defineHiveArmorMonacoTheme(monaco);
    setMonacoLoaded(true);
  };

  const testMutation = useMutation<RuleTestResultDTO, Error, void>({
    mutationFn: () => testRule({ ruleYaml, eventJson }),
  });

  const handleSampleChange = (value: string): void => {
    setSelectedSample(value);
    const found = SAMPLE_EVENTS.find((s) => s.label === value);
    if (found) {
      setEventJson(found.value);
    }
  };

  const theme = monacoLoaded ? `hivearmor-${appearance}` : appearance === 'dark' ? 'vs-dark' : 'vs';

  const result = testMutation.data ?? null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="Rule Testing Sandbox"
        description="Paste a Sigma YAML rule and a sample JSON event to validate detection logic in memory."
        breadcrumbs={[
          { label: 'Admin' },
          { label: 'Rules' },
          { label: 'Test' },
        ]}
      />

      {/* Two-column editor area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 16,
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Left — Detection Rule YAML editor */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--ha-border)',
                background: 'var(--ha-surface-raised)',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 600,
                color: 'var(--ha-text-primary)',
              }}
            >
              Detection Rule
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Suspense
                fallback={
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'var(--ha-text-secondary)',
                    }}
                  >
                    <Spinner size="md" />
                  </div>
                }
              >
                <Editor
                  height="100%"
                  language="yaml"
                  theme={theme}
                  value={ruleYaml}
                  onChange={(val) => setRuleYaml(val ?? '')}
                  beforeMount={handleMonacoBeforeMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                  }}
                />
              </Suspense>
            </div>
          </div>

          {/* Right — Test Event JSON editor */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {/* Header row with label + sample selector */}
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--ha-border)',
                background: 'var(--ha-surface-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  fontWeight: 600,
                  color: 'var(--ha-text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                Test Event (JSON)
              </span>
              <FormSelect
                aria-label="Load Sample Event"
                value={selectedSample}
                onChange={(_evt, value) => handleSampleChange(value)}
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  background: 'var(--ha-surface-primary)',
                  color: 'var(--ha-text-primary)',
                  border: '1px solid var(--ha-border)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  maxWidth: 220,
                  cursor: 'pointer',
                } as React.CSSProperties}
              >
                <FormSelectOption value="" label="Load Sample Event" isDisabled />
                {SAMPLE_EVENTS.map((s) => (
                  <FormSelectOption key={s.label} value={s.label} label={s.label} />
                ))}
              </FormSelect>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Suspense
                fallback={
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: 'var(--ha-text-secondary)',
                    }}
                  >
                    <Spinner size="md" />
                  </div>
                }
              >
                <Editor
                  height="100%"
                  language="json"
                  theme={theme}
                  value={eventJson}
                  onChange={(val) => setEventJson(val ?? '')}
                  beforeMount={handleMonacoBeforeMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Run Test button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <HaButton
            variant="primary"
            isDisabled={testMutation.isPending}
            isLoading={testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            Run Test
          </HaButton>
        </div>

        {/* Result panel */}
        {testMutation.isError && (
          <ResultPanel>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--ha-critical)',
              }}
            >
              <TimesCircleIcon />
              <span style={{ fontWeight: 600 }}>
                Request failed: {testMutation.error.message}
              </span>
            </div>
          </ResultPanel>
        )}

        {result !== null && !testMutation.isError && (
          <ResultPanel>
            {result.matched ? (
              <MatchedResult result={result} />
            ) : (
              <NoMatchResult result={result} />
            )}
          </ResultPanel>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ResultPanelProps {
  children: React.ReactNode;
}

function ResultPanel({ children }: ResultPanelProps): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 4,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

interface ResultProps {
  result: RuleTestResultDTO;
}

function MatchedResult({ result }: ResultProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--ha-positive)',
          fontWeight: 600,
          fontSize: 'var(--ha-text-base)',
        }}
      >
        <CheckCircleIcon />
        <span>Rule Matched</span>
      </div>

      {/* Matched fields as monospace chips */}
      {result.matchedFields.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {result.matchedFields.map((field) => (
            <MatchedFieldChip key={field} field={field} />
          ))}
        </div>
      )}

      {/* Explanation */}
      {result.explanation && (
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          {result.explanation}
        </div>
      )}
    </div>
  );
}

function NoMatchResult({ result }: ResultProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--ha-critical)',
          fontWeight: 600,
          fontSize: 'var(--ha-text-base)',
        }}
      >
        <TimesCircleIcon />
        <span>No Match</span>
      </div>

      {/* Explanation */}
      {result.explanation && (
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          {result.explanation}
        </div>
      )}
    </div>
  );
}

interface MatchedFieldChipProps {
  field: string;
}

function MatchedFieldChip({ field }: MatchedFieldChipProps): JSX.Element {
  return (
    <span
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 'var(--ha-text-xs)',
        color: 'var(--ha-positive)',
        background: 'color-mix(in srgb, var(--ha-positive) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--ha-positive) 30%, transparent)',
        borderRadius: 3,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {field}
    </span>
  );
}
