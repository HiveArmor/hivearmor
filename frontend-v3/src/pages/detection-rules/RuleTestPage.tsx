import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock3, FlaskConical, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { detectionRulesFixtureMode, fetchRule } from './detectionRules.service';
import DetectionTestConsole from './DetectionTestConsole';

import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';

import './DetectionRulesPage.css';

export function RuleTestPage(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const epsStream = useEpsStream();
  const numericId = Number(id);
  const ruleQuery = useQuery({
    queryKey: ['detection-rule', numericId],
    queryFn: () => fetchRule(numericId),
    enabled: Number.isFinite(numericId),
    staleTime: 30_000,
  });

  return (
    <section className="detection-page">
      <header className="detection-page__identity">
        <div className="detection-page__title"><button className="detection-test-page__back" type="button" onClick={() => navigate('/detection-rules')} aria-label="Back to detection rules"><ArrowLeft size={17} /></button><span><FlaskConical size={20} /></span><div><small>DETECTION ENGINEERING</small><h1>{ruleQuery.data ? `Test · ${ruleQuery.data.ruleName}` : 'Rule Test Console'}</h1></div></div>
      </header>
      {detectionRulesFixtureMode && <div className="detection-page__fixture"><span><strong>Design fixture:</strong> fictional test events are enabled for this sandbox.</span><span>Production never receives these records.</span></div>}
      {ruleQuery.isLoading ? <div className="detection-section-loading"><RefreshCw size={20} className="detection-spin" /><span>Loading rule definition…</span></div> : ruleQuery.isError || !ruleQuery.data ? <div className="detection-state"><h2>Rule definition unavailable</h2><p>{ruleQuery.error instanceof Error ? ruleQuery.error.message : 'The requested rule could not be loaded.'}</p><button type="button" onClick={() => navigate('/detection-rules')}>Back to rules</button></div> : <DetectionTestConsole rules={[ruleQuery.data]} initialRuleId={ruleQuery.data.id} />}
      <div className="detection-status"><StatusDock sseConnected={detectionRulesFixtureMode || epsStream.connected} eps={detectionRulesFixtureMode ? 12840 : epsStream.eps} mode={detectionRulesFixtureMode ? 'historical' : 'live'} /><span><Clock3 size={12} /> Test sandbox · no alert side effects</span></div>
    </section>
  );
}
