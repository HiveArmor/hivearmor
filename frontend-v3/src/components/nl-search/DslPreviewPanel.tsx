/**
 * DslPreviewPanel — Monaco-backed DSL preview with Edit toggle (Sprint 26, task 3.1).
 *
 * Invariants enforced here:
 * - NoAnyTypeInvariant   : zero `any` types
 * - NoRawHexInvariant    : all colors via --ha-* CSS tokens
 * - MonacoLazyInvariant  : Monaco loaded lazily via React.lazy / Suspense
 *
 * Confidence bar:    task 3.2 ✓
 * Execute / Save:    task 3.3 ✓
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import styles from './DslPreviewPanel.module.css';

import { confidenceBand } from '@/types/search.types';

// Lazily import Monaco to avoid bloating the initial bundle.
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DslPreviewPanelProps {
  dsl: string;
  explanation: string;
  confidence: number;
  onExecute: (dsl: string) => void;
  onSaveAsFilter: (dsl: string, label: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SAVE_CONFIRMATION_MS = 2000;

export function DslPreviewPanel(props: DslPreviewPanelProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [currentDsl, setCurrentDsl] = useState(props.dsl);
  const [saveLabel, setSaveLabel] = useState<'Save as filter' | 'Saved ✓'>('Save as filter');

  // Ref for the save-confirmation timer — cleared on unmount by the effect below.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state whenever the incoming `dsl` prop changes.
  useEffect(() => {
    setCurrentDsl(props.dsl);
    setEditing(false);
  }, [props.dsl]);

  // Cleanup any pending timers on unmount (populated in task 3.3).
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleToggleEdit = (): void => {
    setEditing(prev => {
      if (prev) {
        // Cancel edit → discard unsaved changes, revert to props.dsl
        setCurrentDsl(props.dsl);
      }
      return !prev;
    });
  };

  const handleMonacoChange = (value: string | undefined): void => {
    setCurrentDsl(value ?? '');
  };

  const handleSaveAsFilter = (): void => {
    props.onSaveAsFilter(currentDsl, 'AI-suggested filter');
    setSaveLabel('Saved ✓');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveLabel('Save as filter');
      saveTimerRef.current = null;
    }, SAVE_CONFIRMATION_MS);
  };

  return (
    <div className={styles.panel}>
      {/* Explanation */}
      <div className={styles.explanation}>{props.explanation}</div>

      {/* Confidence bar — task 3.2 */}
      {(() => {
        const band = confidenceBand(props.confidence);
        const fillWidth = `${Math.max(0, Math.min(1, props.confidence)) * 100}%`;
        return (
          <div className={styles.confidenceBar} data-band={band}>
            <div className={styles.confidenceFill} style={{ width: fillWidth }} />
            <span>{props.confidence.toFixed(2)}</span>
          </div>
        );
      })()}

      <div className={styles.monacoWrapper}>
        <Suspense fallback={<div className={styles.monacoFallback}>Loading editor…</div>}>
          <MonacoEditor
            language="json"
            height="240px"
            value={currentDsl}
            onChange={handleMonacoChange}
            options={{
              readOnly: !editing,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </Suspense>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.editToggle}
          onClick={handleToggleEdit}
        >
          {editing ? 'Cancel edit' : 'Edit'}
        </button>

        {/* Execute button — task 3.3 */}
        <button
          type="button"
          className={styles.executeButton}
          onClick={() => props.onExecute(currentDsl)}
        >
          Execute
        </button>

        {/* Save as filter button — task 3.3 */}
        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSaveAsFilter}
          disabled={saveLabel === 'Saved ✓'}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
