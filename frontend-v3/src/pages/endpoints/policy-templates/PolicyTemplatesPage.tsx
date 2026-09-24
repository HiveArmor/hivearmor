/**
 * Policy Templates — PT-2 tabbed template editor + library.
 *
 * A separate page from the FIM push console (`AgentFimPolicyPage`), which is left
 * untouched. Here operators author reusable, tabbed monitor templates (Generic/
 * Monitor/Event/UEBA/User Log/FIM/Change/Script/Certificate/Osquery/Scans) that
 * save a PT-0 `policyConfig` via the PT-1 library endpoints. FIM authoring is folded
 * in as one tab — there is no separate FIM template form.
 *
 * Honesty: sections the agent cannot yet enforce (everything except FIM + collectors
 * + telemetry cadence + allow_shell, pending PT-4/PT-5) are LABELED, never hidden.
 */

import { useMemo, useState } from 'react';

import { EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { LayoutTemplate } from 'lucide-react';

import { TemplateEditor } from './TemplateEditor';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { HaModal } from '@/components/ha-modal/HaModal';
import {
  useClonePolicyTemplate,
  useCreatePolicyTemplate,
  usePolicyTemplates,
  useUpdatePolicyTemplate,
} from '@/hooks/usePolicyTemplates';
import { ApiError } from '@/lib/apiClient';
import {
  buildTemplateEnvelope,
  defaultPolicyTemplateForm,
  formToTemplateUpdateDto,
  templateDtoToForm,
  validatePolicyTemplateForm,
} from '@/lib/policyTemplateSchema';
import { showErrorToast, showSuccessToast } from '@/lib/toast';
import {
  canMutateAgentPolicies,
  canReadAgentPolicies,
} from '@/services/agentPolicy.capabilities';
import type { TemplateSearchParams } from '@/services/policyTemplatesApi.service';
import { useAuthStore } from '@/store/auth.store';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';
import type { PolicyTemplateFormValues, TemplateScope } from '@/types/policyTemplates';

import './PolicyTemplatesPage.css';

const HONESTY_BANNER =
  'Templates author the full PT-0 schema now. As of this release the agent enforces FIM, ' +
  'collector enablement, telemetry cadence and the shell gate; the other tabs are saved and ' +
  'labeled “authored — not yet enforced”. PT-4 will enforce Event, Change, Script, Certificate ' +
  'and User Log; Scans lands in PT-5. Monitor, UEBA and template-driven Osquery are authored ' +
  'ahead of a named wave. Applying templates to hosts is PT-3.';

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function templateScope(dto: UtmAgentPolicyDTO): TemplateScope {
  return String((dto as { scope?: unknown }).scope ?? 'ORG').toUpperCase() === 'GLOBAL'
    ? 'GLOBAL'
    : 'ORG';
}

type EditorState =
  | { kind: 'create' }
  | { kind: 'edit'; id: number }
  | null;

export function PolicyTemplatesPage(): JSX.Element {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canRead = canReadAgentPolicies(roles);
  const canMutate = canMutateAgentPolicies(roles);
  const canWriteGlobal = roles.includes('ROLE_ADMIN');

  const [nameFilter, setNameFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState<TemplateScope | ''>('');
  const [platformFilter, setPlatformFilter] = useState('');

  const searchParams: TemplateSearchParams = useMemo(
    () => ({
      name: nameFilter || undefined,
      scope: scopeFilter || undefined,
      platform: platformFilter || undefined,
    }),
    [nameFilter, scopeFilter, platformFilter],
  );

  const { data, isLoading, isError, error } = usePolicyTemplates(searchParams, canRead);
  const createMutation = useCreatePolicyTemplate();
  const updateMutation = useUpdatePolicyTemplate();
  const cloneMutation = useClonePolicyTemplate();

  const [editor, setEditor] = useState<EditorState>(null);
  const [form, setForm] = useState<PolicyTemplateFormValues>(defaultPolicyTemplateForm());

  const templates = useMemo(() => data ?? [], [data]);

  if (!canRead) {
    return (
      <div className="policy-templates-page">
        <div className="policy-templates-page__banner">
          <HaInlineBanner
            variant="danger"
            title="Access denied"
            description="You need Analyst, SOC Manager, or Admin to view policy templates."
          />
        </div>
      </div>
    );
  }

  const openCreate = (): void => {
    setForm(defaultPolicyTemplateForm());
    setEditor({ kind: 'create' });
  };

  const openEdit = (dto: UtmAgentPolicyDTO): void => {
    if (dto.id == null) return;
    setForm(templateDtoToForm(dto));
    setEditor({ kind: 'edit', id: dto.id });
  };

  const closeEditor = (): void => setEditor(null);

  const onSave = async (): Promise<void> => {
    const errs = validatePolicyTemplateForm(form);
    if (errs.length > 0) {
      showErrorToast(errs[0] ?? 'Invalid template');
      return;
    }
    try {
      if (editor?.kind === 'edit') {
        await updateMutation.mutateAsync({ id: editor.id, dto: formToTemplateUpdateDto(form) });
        showSuccessToast('Template saved (version bumped)');
      } else {
        await createMutation.mutateAsync(buildTemplateEnvelope(form));
        showSuccessToast('Template created');
      }
      closeEditor();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        showErrorToast('Denied — GLOBAL templates require an administrator.');
      } else {
        showErrorToast(err instanceof Error ? err.message : 'Save failed');
      }
    }
  };

  const onClone = async (dto: UtmAgentPolicyDTO): Promise<void> => {
    if (dto.id == null) return;
    const suggested = `${dto.policyName} (copy)`;
    const newName = window.prompt('Name for the cloned template:', suggested);
    if (newName == null || !newName.trim()) return;
    try {
      await cloneMutation.mutateAsync({ id: dto.id, newName: newName.trim() });
      showSuccessToast('Template cloned into your org');
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : 'Clone failed');
    }
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="policy-templates-page">
      <div className="policy-templates-page__banner">
        <HaInlineBanner
          variant="warning"
          title="Policy templates — authoring ahead of enforcement"
          description={HONESTY_BANNER}
        />
      </div>

      <header className="policy-templates-page__header">
        <div>
          <div className="policy-templates-page__title-row">
            <h1 className="policy-templates-page__title">Policy Templates</h1>
            {!isLoading && (
              <span className="policy-templates-page__count">
                {templates.length.toLocaleString()} {templates.length === 1 ? 'template' : 'templates'}
              </span>
            )}
            {isLoading && <Spinner size="sm" aria-label="Loading templates" />}
          </div>
          <p className="policy-templates-page__job">
            Reusable, tabbed agent monitor templates. FIM authoring lives here as one tab; the FIM
            push console remains separate for assigning &amp; pushing policies to hosts.
          </p>
        </div>
        {canMutate && (
          <HaButton variant="primary" onClick={openCreate}>
            New template
          </HaButton>
        )}
      </header>

      <div className="policy-templates-page__filters" role="search">
        <input
          type="search"
          className="policy-templates-page__filter-input"
          placeholder="Search by name…"
          aria-label="Search templates by name"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        <select
          className="policy-templates-page__filter-input"
          aria-label="Filter by scope"
          value={scopeFilter}
          onChange={(e) => setScopeFilter((e.target.value as TemplateScope) || '')}
        >
          <option value="">All scopes</option>
          <option value="ORG">ORG</option>
          <option value="GLOBAL">GLOBAL</option>
        </select>
        <select
          className="policy-templates-page__filter-input"
          aria-label="Filter by platform"
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="">All platforms</option>
          <option value="windows">windows</option>
          <option value="linux">linux</option>
          <option value="macos">macos</option>
        </select>
      </div>

      {isError && (
        <div className="policy-templates-page__error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load templates'}
        </div>
      )}

      <div className="policy-templates-page__inventory" role="region" aria-label="Policy templates">
        {!isLoading && !isError && templates.length === 0 && (
          <EmptyState>
            <LayoutTemplate size={40} style={{ opacity: 0.3, marginBottom: 12 }} aria-hidden />
            <EmptyStateBody>
              No templates match. Create a reusable monitor template, then apply it to hosts
              (host associations are PT-3).
            </EmptyStateBody>
          </EmptyState>
        )}

        {!isLoading && templates.length > 0 && (
          <table className="policy-templates-page__table" aria-label="Policy templates">
            <thead>
              <tr>
                <th>Name</th>
                <th>Scope</th>
                <th>Platform</th>
                <th>Version</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id ?? t.policyName}>
                  <td className="policy-templates-page__name" title={t.policyName}>
                    {t.policyName}
                  </td>
                  <td>
                    <span className={`policy-templates-page__scope policy-templates-page__scope--${templateScope(t).toLowerCase()}`}>
                      {templateScope(t)}
                    </span>
                  </td>
                  <td>{t.platform ?? '—'}</td>
                  <td className="policy-templates-page__mono">v{t.versionNum ?? '—'}</td>
                  <td>{formatTs(t.updatedAt ?? t.createdAt)}</td>
                  <td>
                    <div className="policy-templates-page__actions">
                      <button
                        type="button"
                        className="policy-templates-page__action"
                        onClick={() => openEdit(t)}
                      >
                        {canMutate ? 'Edit' : 'View'}
                      </button>
                      {canMutate && (
                        <button
                          type="button"
                          className="policy-templates-page__action"
                          onClick={() => void onClone(t)}
                        >
                          Clone
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <HaModal
        isOpen={editor != null}
        onClose={closeEditor}
        title={editor?.kind === 'edit' ? 'Edit policy template' : 'New policy template'}
        width={720}
      >
        <TemplateEditor
          form={form}
          onChange={setForm}
          onSave={() => void onSave()}
          onCancel={closeEditor}
          canMutate={canMutate}
          canWriteGlobal={canWriteGlobal}
          isEdit={editor?.kind === 'edit'}
          busy={busy}
        />
      </HaModal>
    </div>
  );
}
