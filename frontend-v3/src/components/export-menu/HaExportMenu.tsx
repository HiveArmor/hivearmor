/**
 * B0-4 — HaExportMenu: chain-of-custody result export control.
 *
 * A single Ha-prefixed control for BOTH the hunt results toolbar and the alert queue toolbar. It
 * offers "Export CSV" / "Export NDJSON" over the COMMITTED query/filters (full set, not the visible
 * page), shows an indeterminate progress state with a cancel affordance (AbortController) while the
 * file streams, and — after download — surfaces the SHA-256 chain-of-custody hash (short form) with
 * a copy affordance and a link to the full manifest so the analyst can attest to it.
 *
 * Design system: Ha* wrappers + tokens only (no hex), no `any`, keyboard-reachable, color never the
 * sole differentiator, `aria-live="polite"` on the progress + result regions.
 * See .plan/specs/B0-4-forensic-export.md §7.
 */

import { useCallback, useRef, useState } from 'react';

import { Check, ChevronDown, Copy, Download, FileJson, FileSpreadsheet, ShieldCheck, X } from 'lucide-react';

import { HaPopover } from '@/components/ha-popover';
import type { ExportFormat, ExportResult, ExportSurface } from '@/pages/search-hunt/forensicExport.types';

import './HaExportMenu.css';

export interface HaExportMenuProps {
  /** Which surface this control exports (drives the endpoints + default filename). */
  surface: ExportSurface;
  /** Disable when there are no results to export. */
  disabled?: boolean;
  /** Run the export for the chosen format. The handler owns the committed query/filters. */
  onExport: (format: ExportFormat, signal: AbortSignal) => Promise<ExportResult>;
  /** Icon-only trigger (no "Export" label / chevron) for dense control strips. */
  compact?: boolean;
}

type Phase = 'idle' | 'exporting' | 'done' | 'error';

const SHORT_HASH_LENGTH = 12;

function shortHash(sha256: string): string {
  return sha256.length > SHORT_HASH_LENGTH ? `${sha256.slice(0, SHORT_HASH_LENGTH)}…` : sha256;
}

export function HaExportMenu({ surface, disabled = false, onExport, compact = false }: HaExportMenuProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runExport = useCallback(
    async (format: ExportFormat): Promise<void> => {
      setMenuOpen(false);
      setResult(null);
      setErrorMessage(null);
      setCopied(false);
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase('exporting');
      try {
        const outcome = await onExport(format, controller.signal);
        setResult(outcome);
        setPhase('done');
      } catch (error) {
        if (controller.signal.aborted) {
          setPhase('idle');
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Export failed.');
        setPhase('error');
      } finally {
        abortRef.current = null;
      }
    },
    [onExport],
  );

  const cancelExport = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  const copyHash = useCallback(async (): Promise<void> => {
    if (!result?.sha256) return;
    try {
      await navigator.clipboard.writeText(result.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [result]);

  const dismissResult = useCallback((): void => {
    setPhase('idle');
    setResult(null);
    setErrorMessage(null);
  }, []);

  const busy = phase === 'exporting';

  return (
    <div className="ha-export">
      <HaPopover
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        ariaLabel="Export results"
        placement="bottom-end"
        width={220}
        trigger={
          <button
            type="button"
            className={compact ? 'ha-export__trigger ha-export__trigger--compact' : 'ha-export__trigger'}
            disabled={disabled || busy}
            aria-label="Export results"
            title={disabled ? 'No results to export' : 'Export results'}
          >
            <Download size={compact ? 14 : 13} aria-hidden="true" />
            {!compact && <span>Export</span>}
            {!compact && <ChevronDown size={12} aria-hidden="true" />}
          </button>
        }
      >
        {({ close }) => (
          <div role="menu" aria-label="Export format" className="ha-export__menu">
            <strong className="ha-export__menu-label">Chain-of-custody export</strong>
            <button
              type="button"
              role="menuitem"
              className="ha-export__item"
              onClick={() => {
                close();
                void runExport('csv');
              }}
            >
              <FileSpreadsheet size={14} aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="ha-export__item"
              onClick={() => {
                close();
                void runExport('ndjson');
              }}
            >
              <FileJson size={14} aria-hidden="true" />
              <span>Export NDJSON</span>
            </button>
          </div>
        )}
      </HaPopover>

      {busy && (
        <div className="ha-export__progress" role="status" aria-live="polite">
          <span className="ha-export__spinner" aria-hidden="true" />
          <span>Streaming full result set…</span>
          <button type="button" className="ha-export__cancel" onClick={cancelExport}>
            <X size={12} aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <div className="ha-export__attest" role="status" aria-live="polite">
          <ShieldCheck size={14} aria-hidden="true" className="ha-export__attest-icon" />
          <div className="ha-export__attest-body">
            <strong>
              {result.filename} downloaded
              {result.recordCount !== null ? ` · ${result.recordCount.toLocaleString()} records` : ''}
            </strong>
            {result.sha256 ? (
              <div className="ha-export__hash-row">
                <span className="ha-export__hash-label">SHA-256</span>
                <code className="ha-export__hash" title={result.sha256}>
                  {shortHash(result.sha256)}
                </code>
                <button
                  type="button"
                  className="ha-export__hash-copy"
                  onClick={() => void copyHash()}
                  aria-label="Copy full SHA-256 to clipboard"
                >
                  {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                {result.exportId && (
                  <a
                    className="ha-export__manifest-link"
                    href={`/api/${surface === 'hunt-search' ? 'ha-hunt/search' : 'ha-alerts'}/export/${encodeURIComponent(result.exportId)}/manifest`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View manifest
                  </a>
                )}
              </div>
            ) : (
              <span className="ha-export__note">
                File downloaded, but the chain-of-custody manifest was unavailable. Retry to obtain a
                verifiable hash before attesting.
              </span>
            )}
          </div>
          <button
            type="button"
            className="ha-export__dismiss"
            onClick={dismissResult}
            aria-label="Dismiss export confirmation"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ha-export__error" role="alert" aria-live="polite">
          <X size={13} aria-hidden="true" />
          <span>{errorMessage}</span>
          <button
            type="button"
            className="ha-export__dismiss"
            onClick={dismissResult}
            aria-label="Dismiss export error"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
