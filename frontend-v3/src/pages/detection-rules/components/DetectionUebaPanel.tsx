/**
 * Detection Engineering — UEBA / ML-assist panel (STAGING CANDIDATE).
 *
 * Live `/api/ha-ueba/*` with DEV fixture fallback. Surfaces z-score deviations
 * and entity risk. Does not invent trained-model scores.
 */

import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { DeviationFindingsTable } from '@/pages/ueba/components/DeviationFindingsTable';
import { UserRiskTable } from '@/pages/ueba/risk/UserRiskTable';
import {
  UEBA_ALERT_PIVOT_NOTE,
  UEBA_API_SCOPE_NOTE,
  UEBA_MODEL_HONESTY,
  UEBA_TOTAL_SCORE_THRESHOLD,
  UEBA_VIEW_DENIED_TITLE,
  canViewUeba,
} from '@/services/ueba.capabilities';
import { getAnomalyCounts, getDeviations, getRiskScores, uebaFixtureMode } from '@/services/ueba.service';
import { useAuthStore } from '@/store/auth.store';
import type { AnomalyCountsDTO, HaUebaDeviationDTO, UserRiskDTO } from '@/types/ueba.types';

import './DetectionUebaPanel.css';

export const DETECTION_UEBA_JOB_SENTENCE =
  'UEBA assist in the detection path — review peer-group z-score deviations and entity risk, then pivot to hunt or dossier. Not a trained model in the event-processor.';

export function DetectionUebaPanel(): JSX.Element {
  const roles = useAuthStore((state) => state.user?.roles ?? []);
  const allowed = canViewUeba(roles);

  const deviationsQuery = useQuery<HaUebaDeviationDTO[], Error>({
    queryKey: ['ueba', 'deviations'],
    queryFn: getDeviations,
    enabled: allowed,
    staleTime: 30_000,
  });
  const riskQuery = useQuery<UserRiskDTO[], Error>({
    queryKey: ['ueba', 'risk-scores'],
    queryFn: getRiskScores,
    enabled: allowed,
    staleTime: 30_000,
  });
  const countsQuery = useQuery<AnomalyCountsDTO, Error>({
    queryKey: ['ueba', 'anomaly-counts'],
    queryFn: getAnomalyCounts,
    enabled: allowed,
    staleTime: 30_000,
  });

  const scoredUsers = useMemo(
    () => (riskQuery.data ?? []).filter((row) => row.totalScore >= UEBA_TOTAL_SCORE_THRESHOLD).length,
    [riskQuery.data],
  );

  if (!allowed) {
    return (
      <section className="detection-ueba" aria-label="UEBA detection assist" data-testid="detection-ueba-denied">
        <div className="detection-ueba__denied">
          <ShieldAlert size={28} aria-hidden="true" />
          <h2>UEBA restricted</h2>
          <p>{UEBA_VIEW_DENIED_TITLE}</p>
        </div>
      </section>
    );
  }

  const counts = countsQuery.data;
  const anomalyTotal = (counts?.tier10 ?? 0) + (counts?.tier25 ?? 0) + (counts?.tier50 ?? 0);

  return (
    <section className="detection-ueba" aria-label="UEBA detection assist" data-testid="detection-ueba-panel">
      <header className="detection-ueba__header">
        <div>
          <div className="detection-ueba__eyebrow">
            <Activity size={14} aria-hidden="true" />
            <span>Detection path assist</span>
            <span className="detection-ueba__badge">STAGING CANDIDATE</span>
          </div>
          <h2>UEBA / baseline deviations</h2>
          <p>{DETECTION_UEBA_JOB_SENTENCE}</p>
        </div>
        <Link className="detection-ueba__full" to="/ueba/risk">
          Open UEBA Risk
        </Link>
      </header>

      {uebaFixtureMode && (
        <div className="detection-ueba__fixture" role="status" data-testid="detection-ueba-fixture">
          <strong>Design fixture:</strong>
          <span>Fictional z-score rows are enabled for visual review. Production never receives these records.</span>
        </div>
      )}

      <div className="detection-ueba__honesty" role="status" data-testid="detection-ueba-honesty">
        <AlertTriangle size={14} aria-hidden="true" />
        <div>
          <p>{UEBA_MODEL_HONESTY}</p>
          <p>{UEBA_API_SCOPE_NOTE}</p>
          <p>{UEBA_ALERT_PIVOT_NOTE}</p>
        </div>
      </div>

      <div className="detection-ueba__kpis" data-testid="detection-ueba-kpis">
        <article>
          <small>Scored users</small>
          <strong>{riskQuery.isLoading ? '…' : (riskQuery.data ?? []).length}</strong>
        </article>
        <article>
          <small>Deviation rows</small>
          <strong>{deviationsQuery.isLoading ? '…' : (deviationsQuery.data ?? []).length}</strong>
        </article>
        <article>
          <small>Anomaly tiers (10 / 25 / 50)</small>
          <strong>
            {countsQuery.isLoading
              ? '…'
              : `${counts?.tier10 ?? 0} / ${counts?.tier25 ?? 0} / ${counts?.tier50 ?? 0}`}
          </strong>
        </article>
        <article>
          <small>At/above synthetic-alert threshold ({UEBA_TOTAL_SCORE_THRESHOLD})</small>
          <strong>{riskQuery.isLoading ? '…' : scoredUsers}</strong>
        </article>
      </div>

      {!deviationsQuery.isLoading &&
        !riskQuery.isLoading &&
        !countsQuery.isLoading &&
        (deviationsQuery.data ?? []).length === 0 &&
        (riskQuery.data ?? []).length === 0 &&
        anomalyTotal === 0 && (
          <div className="detection-ueba__empty" role="status" data-testid="detection-ueba-empty">
            <strong>No UEBA rows yet.</strong>
            <span>
              The baseline engine may have no scored users on this tenant. Empty panels are not a
              production-ready UEBA or trained-model claim.
            </span>
          </div>
        )}

      <div className="detection-ueba__body">
        <DeviationFindingsTable
          data={deviationsQuery.data}
          isLoading={deviationsQuery.isLoading}
          isError={deviationsQuery.isError}
        />
        <UserRiskTable
          data={riskQuery.data}
          isLoading={riskQuery.isLoading}
          isError={riskQuery.isError}
        />
      </div>
    </section>
  );
}
