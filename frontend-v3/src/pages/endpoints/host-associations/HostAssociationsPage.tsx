/**
 * Host → Template Associations — PT-3.
 *
 * FortiSIEM-style ranked, first-match binding: a host's effective policy = the templates on the
 * highest-ranked row that matches it. Editing rows is a DRAFT; the explicit **Apply** button
 * re-resolves every affected host and re-pushes APPLY_POLICY (delivery/drift shown in the result).
 * A per-host "effective policy" preview shows which row won and the resolved sections.
 *
 * Separate page from the PT-2 tabbed editor (/endpoints/policy-templates), which is untouched.
 * Hive Carbon tokens only, no raw hex, WCAG 2.2 AA.
 */

import { useMemo, useState } from 'react';

import { EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { ArrowDown, ArrowUp, Network, Trash2 } from 'lucide-react';

import './HostAssociationsPage.css';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaModal } from '@/components/ha-modal/HaModal';
import {
  useApplyHostAssociation,
  useCreateHostAssociation,
  useDeleteHostAssociation,
  useHostAssociations,
  useResolveHost,
  useUpdateHostAssociation,
} from '@/hooks/useHostTemplateAssociations';
import { usePolicyTemplates } from '@/hooks/usePolicyTemplates';
import { ApiError } from '@/lib/apiClient';
import {
  defaultRows,
  docToForm,
  formToDoc,
  reorder,
  validateRows,
} from '@/lib/hostAssociationRows';
import { showErrorToast, showSuccessToast } from '@/lib/toast';
import {
  canMutateAgentPolicies,
  canReadAgentPolicies,
} from '@/services/agentPolicy.capabilities';
import { useAuthStore } from '@/store/auth.store';
import type {
  ApplyResultDTO,
  AssociationRowForm,
  AssociationScope,
  EffectivePolicyDTO,
  HostTemplateAssociationDTO,
  MatchKind,
} from '@/types/hostTemplateAssociations';

const HONESTY_BANNER =
  'A host’s effective policy is the templates on the highest-ranked matching row (first match ' +
  'wins). Editing rows is a draft — nothing reaches an agent until you press Apply, which ' +
  're-resolves affected hosts and re-pushes APPLY_POLICY. “Tag” matching is reserved: there is ' +
  'no agent-tag source yet, so a tag row matches no host until a later wave adds one.';

const MATCH_KINDS: { value: MatchKind; label: string }[] = [
  { value: 'group', label: 'Agent group' },
  { value: 'host', label: 'Host (agent id)' },
  { value: 'tag', label: 'Tag (reserved)' },
  { value: 'any', label: 'Any host (catch-all)' },
];

type EditorState =
  | { kind: 'create' }
  | { kind: 'edit'; id: number; name: string; scope: AssociationScope }
  | null;

function formatTs(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export function HostAssociationsPage(): JSX.Element {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canRead = canReadAgentPolicies(roles);
  const canMutate = canMutateAgentPolicies(roles);

  const { data, isLoading, isError, error } = useHostAssociations(canRead);
  const templatesQuery = usePolicyTemplates({}, canRead);
  const createMutation = useCreateHostAssociation();
  const updateMutation = useUpdateHostAssociation();
  const deleteMutation = useDeleteHostAssociation();
  const applyMutation = useApplyHostAssociation();
  const resolveMutation = useResolveHost();

  const tables = useMemo(() => data ?? [], [data]);
  const templateNames = useMemo(
    () => (templatesQuery.data ?? []).map((t) => t.policyName).filter(Boolean),
    [templatesQuery.data],
  );

  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<AssociationScope>('ORG');
  const [rows, setRows] = useState<AssociationRowForm[]>(defaultRows());

  const [applyResult, setApplyResult] = useState<ApplyResultDTO | null>(null);
  const [previewHost, setPreviewHost] = useState('');
  const [preview, setPreview] = useState<EffectivePolicyDTO | null>(null);

  if (!canRead) {
    return (
      <div className="host-assoc-page">
        <div className="host-assoc-page__banner">
          <HaInlineBanner
            variant="danger"
            title="Access denied"
            description="You need Analyst, SOC Manager, or Admin to view host associations."
          />
        </div>
      </div>
    );
  }

  const openCreate = (): void => {
    setName('');
    setScope('ORG');
    setRows(defaultRows());
    setEditor({ kind: 'create' });
  };

  const openEdit = (dto: HostTemplateAssociationDTO): void => {
    if (dto.id == null) return;
    setName(dto.name);
    setScope((dto.scope as AssociationScope) ?? 'ORG');
    setRows(docToForm(dto.rowsJson));
    setEditor({ kind: 'edit', id: dto.id, name: dto.name, scope: (dto.scope as AssociationScope) ?? 'ORG' });
  };

  const closeEditor = (): void => setEditor(null);

  const setRow = (i: number, patch: Partial<AssociationRowForm>): void =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addRow = (): void =>
    setRows((prev) => [
      ...prev.filter((r) => r.matchKind !== 'any'),
      { rank: 0, name: '', matchKind: 'group', matchValue: '', templates: [] },
      ...prev.filter((r) => r.matchKind === 'any'),
    ]);

  const removeRow = (i: number): void => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const toggleTemplate = (i: number, tpl: string): void =>
    setRow(i, {
      templates: rows[i].templates.includes(tpl)
        ? rows[i].templates.filter((t) => t !== tpl)
        : [...rows[i].templates, tpl],
    });

  const onSave = async (): Promise<void> => {
    if (!name.trim()) {
      showErrorToast('Give the association table a name.');
      return;
    }
    const errs = validateRows(rows);
    if (errs.length > 0) {
      showErrorToast(errs[0] ?? 'Fix the rows first.');
      return;
    }
    const dto: HostTemplateAssociationDTO = {
      name: name.trim(),
      scope,
      rowsJson: formToDoc(rows, scope),
    };
    try {
      if (editor?.kind === 'edit') {
        await updateMutation.mutateAsync({ id: editor.id, dto });
        showSuccessToast('Draft saved (version bumped). Press Apply to push to hosts.');
      } else {
        await createMutation.mutateAsync(dto);
        showSuccessToast('Association table created (draft). Press Apply to push.');
      }
      closeEditor();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        showErrorToast('Denied — GLOBAL tables require an administrator.');
      } else {
        showErrorToast(err instanceof Error ? err.message : 'Save failed');
      }
    }
  };

  const onDelete = async (dto: HostTemplateAssociationDTO): Promise<void> => {
    if (dto.id == null) return;
    if (!window.confirm(`Delete association table “${dto.name}”? This does not un-push already-applied policies.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(dto.id);
      showSuccessToast('Association table deleted');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const onApply = async (dto: HostTemplateAssociationDTO): Promise<void> => {
    if (dto.id == null) return;
    try {
      const result = await applyMutation.mutateAsync(dto.id);
      setApplyResult(result);
      showSuccessToast(`Applied — pushed to ${result.pushedCount} of ${result.affectedHostCount} host(s)`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        showErrorToast('Denied — applying a GLOBAL table requires an administrator.');
      } else {
        showErrorToast(err instanceof Error ? err.message : 'Apply failed');
      }
    }
  };

  const onPreview = async (): Promise<void> => {
    if (!previewHost.trim()) return;
    try {
      const eff = await resolveMutation.mutateAsync(previewHost.trim());
      setPreview(eff);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Resolve failed');
    }
  };

  return (
    <div className="host-assoc-page">
      <div className="host-assoc-page__banner">
        <HaInlineBanner
          variant="info"
          title="Host → Template associations — ranked, first-match"
          description={HONESTY_BANNER}
        />
      </div>

      <header className="host-assoc-page__header">
        <div>
          <div className="host-assoc-page__title-row">
            <h1 className="host-assoc-page__title">Host Associations</h1>
            {!isLoading && (
              <span className="host-assoc-page__count">
                {tables.length.toLocaleString()} {tables.length === 1 ? 'table' : 'tables'}
              </span>
            )}
            {isLoading && <Spinner size="sm" aria-label="Loading associations" />}
          </div>
          <p className="host-assoc-page__job">
            Bind hosts to policy templates by rank. The first matching row wins; press Apply to
            re-resolve affected hosts and push their effective policy.
          </p>
        </div>
        {canMutate && (
          <HaButton variant="primary" onClick={openCreate}>
            New association table
          </HaButton>
        )}
      </header>

      {/* per-host effective-policy preview */}
      <section className="host-assoc-page__preview" aria-label="Effective policy preview">
        <label className="host-assoc-page__preview-label" htmlFor="preview-host">
          Preview a host’s effective policy
        </label>
        <div className="host-assoc-page__preview-row">
          <input
            id="preview-host"
            type="text"
            className="host-assoc-page__input"
            placeholder="Agent id, e.g. 42"
            value={previewHost}
            onChange={(e) => setPreviewHost(e.target.value)}
          />
          <HaButton
            variant="secondary"
            onClick={() => void onPreview()}
            disabled={!previewHost.trim() || resolveMutation.isPending}
          >
            Resolve
          </HaButton>
        </div>
        {preview && (
          <div className="host-assoc-page__preview-result" role="status">
            {preview.matchedRank == null ? (
              <span className="host-assoc-page__badge host-assoc-page__badge--warn">
                Host {preview.host} did not match any row
              </span>
            ) : (
              <>
                <span className="host-assoc-page__badge">
                  Winning row: rank {preview.matchedRank} · {preview.matchedRowName} ·
                  matched by {preview.matchedBy}
                </span>
                <span className="host-assoc-page__templates">
                  Templates: {preview.templates.join(' ∪ ') || '—'}
                </span>
                {preview.hasMissingTemplate && (
                  <span className="host-assoc-page__badge host-assoc-page__badge--warn">
                    Missing (skipped): {(preview.missingTemplates ?? []).join(', ')}
                  </span>
                )}
                {preview.resolved && (
                  <details className="host-assoc-page__resolved">
                    <summary>Resolved sections (merged)</summary>
                    <pre>{prettyJson(preview.resolved)}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {isError && (
        <div className="host-assoc-page__error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load associations'}
        </div>
      )}

      <div className="host-assoc-page__list" role="region" aria-label="Association tables">
        {!isLoading && !isError && tables.length === 0 && (
          <EmptyState>
            <Network size={40} style={{ opacity: 0.3, marginBottom: 12 }} aria-hidden />
            <EmptyStateBody>
              No association tables yet. Create one to bind hosts to policy templates by rank.
            </EmptyStateBody>
          </EmptyState>
        )}

        {tables.map((t) => (
          <article key={t.id} className="host-assoc-card">
            <div className="host-assoc-card__head">
              <div>
                <h2 className="host-assoc-card__name">
                  {t.name}
                  <span className={`host-assoc-page__badge host-assoc-page__badge--${t.scope === 'GLOBAL' ? 'global' : 'org'}`}>
                    {t.scope ?? 'ORG'}
                  </span>
                  <span className="host-assoc-card__ver">v{t.versionNum ?? 1}</span>
                </h2>
                <p className="host-assoc-card__applied">
                  Last applied: {formatTs(t.lastAppliedAt)}
                </p>
              </div>
              {canMutate && (
                <div className="host-assoc-card__actions">
                  <HaButton variant="secondary" onClick={() => openEdit(t)}>
                    Edit
                  </HaButton>
                  <HaButton
                    variant="primary"
                    onClick={() => void onApply(t)}
                    disabled={applyMutation.isPending}
                  >
                    Apply
                  </HaButton>
                  <button
                    type="button"
                    className="host-assoc-card__icon-btn"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => void onDelete(t)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              )}
            </div>
            <RankedRowsReadOnly rowsJson={t.rowsJson} />
          </article>
        ))}
      </div>

      {/* Apply result modal */}
      {applyResult && (
        <HaModal isOpen title="Apply result" onClose={() => setApplyResult(null)}>
          <p className="host-assoc-page__apply-summary">
            Pushed APPLY_POLICY to {applyResult.pushedCount} of {applyResult.affectedHostCount} affected host(s).
          </p>
          <table className="host-assoc-page__table" aria-label="Per-host apply result">
            <thead>
              <tr>
                <th>Host</th>
                <th>Winning row</th>
                <th>Templates</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {applyResult.hosts.map((h) => (
                <tr key={h.host}>
                  <td>{h.host}</td>
                  <td>{h.matchedRank != null ? `#${h.matchedRank} ${h.matchedRowName ?? ''}` : '—'}</td>
                  <td>{(h.templates ?? []).join(' ∪ ') || '—'}</td>
                  <td>
                    <span
                      className={`host-assoc-page__badge host-assoc-page__badge--${h.status === 'PUSHED' ? 'ok' : 'warn'}`}
                    >
                      {h.status === 'PUSHED' ? 'Pushed' : 'Skipped'}
                    </span>
                    {h.detail && <span className="host-assoc-page__detail"> {h.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="host-assoc-page__drift-note">
            Delivery + drift are tracked per policy under the agent’s policy states; a host reports
            APPLIED once it acknowledges the pushed version.
          </p>
        </HaModal>
      )}

      {/* editor modal */}
      {editor && (
        <HaModal
          isOpen
          title={editor.kind === 'edit' ? `Edit “${editor.name}”` : 'New association table'}
          onClose={closeEditor}
        >
          <div className="host-assoc-editor">
            <div className="host-assoc-editor__meta">
              <label>
                Name
                <input
                  type="text"
                  className="host-assoc-page__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Scope
                <select
                  className="host-assoc-page__input"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as AssociationScope)}
                >
                  <option value="ORG">ORG (this tenant)</option>
                  <option value="GLOBAL">GLOBAL (admin only)</option>
                </select>
              </label>
            </div>

            <p className="host-assoc-editor__hint">
              Rank order top→bottom (1 = first match). The “Any host” catch-all is always last.
            </p>

            <ol className="host-assoc-editor__rows">
              {rows.map((r, i) => (
                <li key={i} className="host-assoc-editor__row">
                  <div className="host-assoc-editor__rank">#{i + 1}</div>
                  <div className="host-assoc-editor__reorder">
                    <button
                      type="button"
                      aria-label={`Move ${r.name || 'row'} up`}
                      disabled={i === 0 || r.matchKind === 'any'}
                      onClick={() => setRows((prev) => reorder(prev, i, 'up'))}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${r.name || 'row'} down`}
                      disabled={r.matchKind === 'any' || i >= rows.length - 1 || rows[i + 1]?.matchKind === 'any'}
                      onClick={() => setRows((prev) => reorder(prev, i, 'down'))}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </button>
                  </div>
                  <div className="host-assoc-editor__fields">
                    <input
                      type="text"
                      className="host-assoc-page__input"
                      placeholder="Row name"
                      aria-label={`Row ${i + 1} name`}
                      value={r.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                    />
                    <select
                      className="host-assoc-page__input"
                      aria-label={`Row ${i + 1} match kind`}
                      value={r.matchKind}
                      onChange={(e) => setRow(i, { matchKind: e.target.value as MatchKind })}
                    >
                      {MATCH_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    {r.matchKind !== 'any' && (
                      <input
                        type="text"
                        className="host-assoc-page__input"
                        placeholder={r.matchKind === 'host' ? 'Agent id' : `${r.matchKind} value`}
                        aria-label={`Row ${i + 1} match value`}
                        value={r.matchValue}
                        onChange={(e) => setRow(i, { matchValue: e.target.value })}
                      />
                    )}
                    <fieldset className="host-assoc-editor__templates">
                      <legend>Templates</legend>
                      {templateNames.length === 0 && (
                        <span className="host-assoc-editor__no-templates">
                          No templates in the library yet — create some under Policy Templates.
                        </span>
                      )}
                      {templateNames.map((tpl) => (
                        <label key={tpl} className="host-assoc-editor__tpl">
                          <input
                            type="checkbox"
                            checked={r.templates.includes(tpl)}
                            onChange={() => toggleTemplate(i, tpl)}
                          />
                          {tpl}
                        </label>
                      ))}
                    </fieldset>
                  </div>
                  {r.matchKind !== 'any' && (
                    <button
                      type="button"
                      className="host-assoc-card__icon-btn"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ol>

            <div className="host-assoc-editor__foot">
              <HaButton variant="secondary" onClick={addRow}>
                Add row
              </HaButton>
              <div className="host-assoc-editor__foot-right">
                <HaButton variant="link" onClick={closeEditor}>
                  Cancel
                </HaButton>
                <HaButton
                  variant="primary"
                  onClick={() => void onSave()}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Save draft
                </HaButton>
              </div>
            </div>
          </div>
        </HaModal>
      )}
    </div>
  );
}

/** Read-only rank list rendered on each table card. */
function RankedRowsReadOnly({ rowsJson }: { rowsJson: string }): JSX.Element {
  const rows = useMemo(() => docToForm(rowsJson), [rowsJson]);
  return (
    <table className="host-assoc-page__table" aria-label="Ranked association rows">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Match</th>
          <th>Templates</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>#{i + 1}</td>
            <td>{r.name}</td>
            <td>
              {r.matchKind === 'any' ? (
                <span className="host-assoc-page__badge">any host</span>
              ) : (
                <span>
                  {r.matchKind}: <code>{r.matchValue}</code>
                </span>
              )}
            </td>
            <td>{r.templates.join(' ∪ ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
