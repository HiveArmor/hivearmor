/**
 * BulkActionBar — Appears when rules selected; enable/disable/export/duplicate/delete (Sprint 47 DET-010)
 */

import { useCallback } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Power, PowerOff, Trash2, X } from 'lucide-react';

import { bulkDelete, bulkDuplicate, bulkExport, bulkStatus } from '@/pages/detection-rules/services/detection.service';
import type { RulePreview } from '@/pages/detection-rules/types/detection.types';

interface BulkActionBarProps {
  selectedRules: RulePreview[];
  onClearSelection: () => void;
  onMessage: (message: string) => void;
}

export function BulkActionBar({
  selectedRules,
  onClearSelection,
  onMessage,
}: BulkActionBarProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const ruleIds = selectedRules.map((r) => r.id);

  const invalidateRules = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
    void queryClient.invalidateQueries({ queryKey: ['rule-inventory'] });
  }, [queryClient]);

  const enableMutation = useMutation({
    mutationFn: () => bulkStatus({ ruleIds, targetStatus: 'active' }),
    onSuccess: (result) => {
      onMessage(`${result.summary.succeeded} rules enabled.`);
      invalidateRules();
      onClearSelection();
    },
    onError: (err) => onMessage(err instanceof Error ? err.message : 'Bulk enable failed.'),
  });

  const disableMutation = useMutation({
    mutationFn: () => bulkStatus({ ruleIds, targetStatus: 'disabled' }),
    onSuccess: (result) => {
      onMessage(`${result.summary.succeeded} rules disabled.`);
      invalidateRules();
      onClearSelection();
    },
    onError: (err) => onMessage(err instanceof Error ? err.message : 'Bulk disable failed.'),
  });

  const exportMutation = useMutation({
    mutationFn: () => bulkExport({ ruleIds, format: 'yaml' }),
    onSuccess: (result) => {
      window.open(result.downloadUrl, '_blank', 'noopener');
      onMessage(`${result.ruleCount} rules exported.`);
    },
    onError: (err) => onMessage(err instanceof Error ? err.message : 'Export failed.'),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => bulkDuplicate({ ruleIds }),
    onSuccess: (result) => {
      onMessage(`${result.summary.created} rules duplicated.`);
      invalidateRules();
      onClearSelection();
    },
    onError: (err) => onMessage(err instanceof Error ? err.message : 'Duplicate failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => bulkDelete({ ruleIds, confirm: true }),
    onSuccess: (result) => {
      onMessage(`${result.summary.deleted} rules deleted.`);
      invalidateRules();
      onClearSelection();
    },
    onError: (err) => onMessage(err instanceof Error ? err.message : 'Delete failed.'),
  });

  const isBusy = enableMutation.isPending || disableMutation.isPending ||
    exportMutation.isPending || duplicateMutation.isPending ||
    deleteMutation.isPending;

  if (selectedRules.length === 0) return null;

  const hasManaged = selectedRules.some((r) => r.scope === 'managed');

  return (
    <div className="bulk-action-bar" role="toolbar" aria-label="Bulk rule actions">
      <span className="bulk-action-bar__count">
        {selectedRules.length} rule{selectedRules.length > 1 ? 's' : ''} selected
      </span>

      <div className="bulk-action-bar__actions">
        <button
          type="button"
          onClick={() => enableMutation.mutate()}
          disabled={isBusy}
          title="Enable selected rules"
        >
          <Power size={14} /> Enable
        </button>

        <button
          type="button"
          onClick={() => disableMutation.mutate()}
          disabled={isBusy}
          title="Disable selected rules"
        >
          <PowerOff size={14} /> Disable
        </button>

        <button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={isBusy}
          title="Export selected rules"
        >
          <Download size={14} /> Export
        </button>

        <button
          type="button"
          onClick={() => duplicateMutation.mutate()}
          disabled={isBusy}
          title="Duplicate selected rules"
        >
          <Copy size={14} /> Duplicate
        </button>

        <button
          type="button"
          onClick={() => deleteMutation.mutate()}
          disabled={isBusy || hasManaged}
          title={hasManaged ? 'Cannot delete managed rules' : 'Delete selected rules'}
          data-variant="danger"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <button
        type="button"
        className="bulk-action-bar__close"
        onClick={onClearSelection}
        aria-label="Clear selection"
      >
        <X size={14} />
      </button>
    </div>
  );
}
