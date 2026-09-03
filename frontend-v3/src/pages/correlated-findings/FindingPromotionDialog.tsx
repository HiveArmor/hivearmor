import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Hexagon, ShieldAlert } from 'lucide-react';

import { previewFindingPromotion, promoteFindingToIncident } from './correlatedFindings.service';
import type { CorrelatedFindingDTO } from './correlatedFindings.types';

import { HaModal } from '@/components/ha-modal/HaModal';
import { useToastStore } from '@/components/toast-stack/toastStore';

import './FindingPromotionDialog.css';

export interface FindingPromotionDialogProps {
  finding: CorrelatedFindingDTO | null;
  onClose: () => void;
}

export function FindingPromotionDialog({ finding, onClose }: FindingPromotionDialogProps): JSX.Element | null {
  const addToast = useToastStore((state) => state.addToast);
  const preview = useQuery({
    queryKey: ['correlated-findings', finding?.id, 'promotion-preview'],
    queryFn: () => previewFindingPromotion(finding?.id ?? ''),
    enabled: Boolean(finding),
    staleTime: 30_000,
  });
  const promotion = useMutation({
    mutationFn: () => promoteFindingToIncident(finding?.id ?? '', preview.data?.previewToken ?? ''),
    onSuccess: (result) => {
      addToast({ variant: 'success', title: 'Incident created', description: `${result.incidentId} now contains the correlated finding and its authorized evidence.` });
      onClose();
    },
  });

  if (!finding) return null;
  const handleClose = (): void => { if (!promotion.isPending) onClose(); };
  return (
    <HaModal isOpen onClose={handleClose} title="Promote correlated finding" width={640}>
      <div className="finding-promotion">
        <header><span aria-hidden="true"><Hexagon size={27} /></span><div><small>Decision preview</small><p>Create an incident from the attack story without losing alert, entity, or correlation provenance.</p></div></header>
        {preview.isLoading ? <div className="finding-promotion__loading"><span /><span /><span /></div> : preview.isError || !preview.data ? <div className="finding-promotion__error"><AlertTriangle size={18} /><div><strong>Impact preview unavailable</strong><p>The finding cannot be promoted safely until the server returns its authorized scope and duplicate check.</p></div><button type="button" onClick={() => void preview.refetch()}>Retry</button></div> : <>
          <div className="finding-promotion__body">
            <section><span>Proposed incident</span><h3>{preview.data.proposedTitle}</h3><p>{finding.summary}</p></section>
            <dl><div><dt>Finding</dt><dd>{finding.id}</dd></div><div><dt>Alerts retained</dt><dd>{preview.data.alertCount}</dd></div><div><dt>Entities retained</dt><dd>{preview.data.entityCount}</dd></div><div><dt>Owner</dt><dd>{finding.owner?.name ?? 'Unassigned'}</dd></div></dl>
            {preview.data.duplicateCandidates.length > 0 && <section className="finding-promotion__duplicates"><header><AlertTriangle size={14} /><strong>Possible existing incident</strong></header>{preview.data.duplicateCandidates.map((candidate) => <div key={candidate.id}><code>{candidate.id}</code><span>{candidate.title}</span><em>{candidate.overlapPercent}% overlap</em></div>)}<p>Reviewing the candidate is recommended; this preview does not merge records automatically.</p></section>}
            {preview.data.warnings.map((warning) => <p key={warning} className="finding-promotion__warning"><AlertTriangle size={13} />{warning}</p>)}
          </div>
          {promotion.isError && <p className="finding-promotion__mutation-error" role="alert">Incident promotion failed. No records were changed.</p>}
          <footer><span><ShieldAlert size={13} />Execution is tenant-scoped, version-checked, idempotent, and audited.</span><div><button type="button" onClick={onClose} disabled={promotion.isPending}>Cancel</button><button type="button" onClick={() => promotion.mutate()} disabled={promotion.isPending || !preview.data.previewToken}><CheckCircle2 size={14} />{promotion.isPending ? 'Creating…' : 'Create incident'}</button></div></footer>
        </>}
      </div>
    </HaModal>
  );
}
