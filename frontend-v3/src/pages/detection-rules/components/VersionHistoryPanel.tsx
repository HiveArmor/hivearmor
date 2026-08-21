/**
 * VersionHistoryPanel — Version list with author, date, changes summary;
 * diff view between versions (Sprint 47 DET-016)
 */

import { useCallback, useMemo, useState } from 'react';

import { Clock3, FileClock, GitCompare, RotateCcw } from 'lucide-react';

import type { RuleVersion } from '@/pages/detection-rules/types/detection.types';

interface VersionHistoryPanelProps {
  versions: RuleVersion[];
  currentVersion: number;
  onRevert: (version: number) => void;
  isLoading?: boolean;
  canManage?: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function computeDiff(oldText: string, newText: string): Array<{ type: 'added' | 'removed' | 'same'; line: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: Array<{ type: 'added' | 'removed' | 'same'; line: string }> = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) {
      result.push({ type: 'same', line: oldLine ?? '' });
    } else {
      if (oldLine != null) result.push({ type: 'removed', line: oldLine });
      if (newLine != null) result.push({ type: 'added', line: newLine });
    }
  }
  return result;
}

export function VersionHistoryPanel({
  versions,
  currentVersion,
  onRevert,
  isLoading = false,
  canManage = false,
}: VersionHistoryPanelProps): JSX.Element {
  const [selectedVersion, setSelectedVersion] = useState<RuleVersion | null>(null);
  const [diffBase, setDiffBase] = useState<RuleVersion | null>(null);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const diffLines = useMemo(() => {
    if (!selectedVersion || !diffBase) return null;
    return computeDiff(diffBase.expression, selectedVersion.expression);
  }, [selectedVersion, diffBase]);

  const handleDiff = useCallback((version: RuleVersion) => {
    const idx = sortedVersions.findIndex((v) => v.id === version.id);
    const previous = sortedVersions[idx + 1] ?? null;
    setSelectedVersion(version);
    setDiffBase(previous);
  }, [sortedVersions]);

  if (isLoading) {
    return (
      <section className="version-history-panel" aria-label="Version history">
        <div className="detection-grid-loading" aria-label="Loading versions">
          {Array.from({ length: 4 }, (_, i) => <span key={i} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="version-history-panel" aria-label="Version history">
      <header className="version-history-panel__header">
        <FileClock size={15} />
        <strong>Version history</strong>
        <span>{versions.length} versions</span>
      </header>

      <div className="version-history-panel__content">
        <ul className="version-history-panel__list" role="list">
          {sortedVersions.map((version) => (
            <li
              key={version.id}
              data-current={version.version === currentVersion}
              role="listitem"
            >
              <div className="version-history-panel__version-info">
                <div>
                  <strong>v{version.version}</strong>
                  {version.version === currentVersion && <em>(current)</em>}
                </div>
                <small>
                  <Clock3 size={11} /> {formatDate(version.createdAt)} · {version.author}
                </small>
                {version.changes && <p>{version.changes}</p>}
              </div>
              <div className="version-history-panel__actions">
                <button
                  type="button"
                  onClick={() => handleDiff(version)}
                  title="View diff"
                  aria-label={`View diff for version ${version.version}`}
                >
                  <GitCompare size={13} />
                </button>
                {version.version !== currentVersion && canManage && (
                  <button
                    type="button"
                    onClick={() => onRevert(version.version)}
                    title="Revert to this version"
                    aria-label={`Revert to version ${version.version}`}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {diffLines && selectedVersion && (
          <aside className="version-history-panel__diff" aria-label="Version diff">
            <header>
              <strong>
                Diff: v{diffBase?.version ?? 0} → v{selectedVersion.version}
              </strong>
              <button type="button" onClick={() => { setSelectedVersion(null); setDiffBase(null); }}>
                Close
              </button>
            </header>
            <pre className="version-history-panel__diff-content">
              {diffLines.map((line, i) => (
                <code key={i} data-diff={line.type}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '} {line.line}
                </code>
              ))}
            </pre>
          </aside>
        )}
      </div>
    </section>
  );
}
