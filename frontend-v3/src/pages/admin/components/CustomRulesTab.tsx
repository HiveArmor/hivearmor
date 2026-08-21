/**
 * CustomRulesTab.tsx — Custom Rules editor tab (Task 5.6, Req 5.12, 5.13, 8.5)
 *
 * Features:
 *  - Editable Monaco YAML editor prefilled with a sample Sigma template
 *  - "Upload .yml" button using FileReader.readAsText to populate the editor
 *  - "Test Rule" button navigates to /admin/rules/test carrying current editor content
 *
 * Zero hard-coded hex colours — all colours via var(--ha-*) CSS custom properties.
 * Zero `any` types.
 */

import { lazy, Suspense, useRef, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { HaButton } from '@/components/ha-button/HaButton';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';

// Lazy-load Monaco to keep the initial bundle lean
const Editor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Sample Sigma template prefilled in the editor
// ---------------------------------------------------------------------------
const SAMPLE_SIGMA_TEMPLATE = `id: <uuid>
title: My Custom Detection Rule
status: experimental
logsource:
  product: windows
  service: security
level: medium
tags:
  - attack.execution
  - attack.T1059
detection:
  selection:
    EventID: 4688
    CommandLine|contains: suspicious_command
  condition: selection
falsepositives:
  - Legitimate use of this command
impact:
  confidentiality: medium
  integrity: medium
  availability: low
deduplicateBy:
  - ComputerName
groupBy:
  - User
mitre:
  tactic: execution
  technique: T1059
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CustomRulesTab(): JSX.Element {
  const navigate = useNavigate();
  const theme = useThemeStore((state) => state.theme);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editorContent, setEditorContent] = useState<string>(SAMPLE_SIGMA_TEMPLATE);
  const [monacoReady, setMonacoReady] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Apply HiveArmor Monaco theme before the editor mounts
  const handleBeforeMount = (monaco: typeof import('monaco-editor')): void => {
    defineHiveArmorMonacoTheme(monaco);
    setMonacoReady(true);
  };

  // Trigger hidden file input on button click
  const handleUploadClick = (): void => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  // Read the selected .yml / .yaml file into the editor
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e): void => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setEditorContent(text);
        setUploadError(null);
      }
    };
    reader.onerror = (): void => {
      setUploadError('Failed to read file. Please try again.');
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-uploaded if needed
    event.target.value = '';
  };

  // Navigate to the rule testing sandbox, passing editor content via state
  const handleTestRule = (): void => {
    navigate('/admin/rules/test', { state: { ruleYaml: editorContent } });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 24,
        gap: 16,
        background: 'var(--ha-background)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-base)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            marginRight: 'auto',
          }}
        >
          Custom Rule Editor
        </span>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".yml,.yaml"
          aria-label="Upload YAML rule file"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <HaButton variant="secondary" onClick={handleUploadClick}>
          Upload .yml
        </HaButton>

        <HaButton variant="primary" onClick={handleTestRule}>
          Test Rule
        </HaButton>
      </div>

      {/* Upload error banner */}
      {uploadError !== null && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            background: 'var(--ha-critical)',
            color: 'var(--ha-background)',
            fontSize: 'var(--ha-text-sm)',
            borderRadius: 'var(--ha-radius-base)',
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Editor */}
      <div
        style={{
          flex: 1,
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          overflow: 'hidden',
          minHeight: 480,
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                minHeight: 480,
                color: 'var(--ha-text-secondary)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              Loading editor…
            </div>
          }
        >
          <Editor
            height="100%"
            language="yaml"
            theme={monacoReady ? `hivearmor-${theme}` : theme === 'dark' ? 'vs-dark' : 'vs'}
            value={editorContent}
            onChange={(value) => setEditorContent(value ?? '')}
            beforeMount={handleBeforeMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: 'on',
              readOnly: false,
            }}
          />
        </Suspense>
      </div>

      {/* Hint text */}
      <p
        style={{
          margin: 0,
          fontSize: 'var(--ha-text-xs)',
          color: 'var(--ha-text-secondary)',
        }}
      >
        Write or paste a Sigma-format YAML rule above, or upload an existing{' '}
        <code
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--ha-primary)',
          }}
        >
          .yml
        </code>{' '}
        file. Click <strong>Test Rule</strong> to validate it in the sandbox.
      </p>
    </div>
  );
}
