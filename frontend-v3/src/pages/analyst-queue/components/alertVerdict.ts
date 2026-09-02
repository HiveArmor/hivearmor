/**
 * alertVerdict — derive the AiVerdictCard inputs (design §5a) from the REAL detection signals already
 * present on an AlertDetailDTO. There is no backend "give me a verdict" endpoint (SOC-AI is
 * assistive Q&A only, SOC_AI_ASSISTIVE_ONLY), so this is an honest projection of the enrichment the
 * pipeline already produced — risk score, detection confidence, threat-intel match, MITRE mapping —
 * NOT a fabricated model output. It is deterministic and side-effect free.
 */
import type { AiVerdict, AiReasoningStep, AiEvidenceItem } from '@/components/ai-verdict-card';
import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';

export interface DerivedVerdict {
  verdict: AiVerdict;
  confidence: number;
  summary: string;
  conclusion: string;
  reasoning: AiReasoningStep[];
  evidence: AiEvidenceItem[];
}

/** True when the alert carries enough enrichment to project a verdict worth showing. */
export function hasVerdictSignals(alert: AlertDetailDTO): boolean {
  return (
    typeof alert.riskScore === 'number' ||
    typeof alert.confidence === 'number' ||
    alert.threatIntelMatched === true ||
    Boolean(alert.mitreTechniqueName)
  );
}

function classify(alert: AlertDetailDTO): AiVerdict {
  const risk = alert.riskScore ?? alert.severity * 10; // severity is 0–10; risk is 0–100
  if (alert.threatIntelMatched && risk >= 70) return 'malicious';
  if (risk >= 70) return 'suspicious';
  if (risk >= 40) return 'suspicious';
  if (risk > 0) return 'benign';
  return 'inconclusive';
}

/**
 * Confidence shown on the card. Prefer the detection engine's own confidence; fall back to the
 * risk score. Both are treated as 0–100 (AiVerdictCard also accepts 0–1).
 */
function deriveConfidence(alert: AlertDetailDTO): number {
  if (typeof alert.confidence === 'number') return alert.confidence;
  if (typeof alert.riskScore === 'number') return alert.riskScore;
  return alert.severity * 10;
}

export function alertToVerdict(alert: AlertDetailDTO): DerivedVerdict {
  const verdict = classify(alert);
  const confidence = deriveConfidence(alert);

  const reasoning: AiReasoningStep[] = [
    { label: 'Detection', detail: alert.ruleName ?? alert.category, state: 'done' },
    {
      label: 'Enrichment',
      detail: alert.mitreTechniqueName
        ? `MITRE ${alert.mitreTechniqueId ?? ''} ${alert.mitreTechniqueName}`.trim()
        : 'Geo / asset context applied',
      state: 'done',
    },
    {
      label: 'Threat intel',
      detail: alert.threatIntelMatched
        ? `Matched ${alert.threatIntelIndicatorType ?? 'indicator'}${alert.threatIntelSource ? ` · ${alert.threatIntelSource}` : ''}`
        : 'No intel match',
      state: 'done',
    },
    {
      label: 'Correlation',
      detail: typeof alert.riskScore === 'number' ? `Risk projected ${alert.riskScore}/100` : 'Scored',
      state: 'done',
    },
  ];

  const evidence: AiEvidenceItem[] = [];
  if (typeof alert.riskScore === 'number') {
    evidence.push({ label: 'Risk score', value: `${alert.riskScore}/100` });
  }
  if (alert.killChainPhase) {
    evidence.push({ label: 'Kill-chain phase', value: alert.killChainPhase });
  }
  if (alert.mitreTechniqueName) {
    evidence.push({
      label: 'MITRE technique',
      value: `${alert.mitreTechniqueId ?? ''} ${alert.mitreTechniqueName}`.trim(),
    });
  }
  if (alert.threatIntelMatched) {
    evidence.push({
      label: 'Threat-intel source',
      value: alert.threatIntelSource ?? 'Matched indicator',
    });
  }
  if (alert.adversary?.ip) {
    evidence.push({ label: 'Adversary IP', value: alert.adversary.ip });
  }

  const summary = alert.threatIntelMatched
    ? `Threat-intel–matched ${alert.category.toLowerCase()} activity at ${confidence}% confidence.`
    : `${alert.category} scored ${confidence}% confidence from detection signals.`;

  const conclusion = `Projected from the alert's own enrichment: ${
    alert.ruleName ? `rule "${alert.ruleName}"` : alert.category
  }${alert.mitreTechniqueName ? `, mapped to ${alert.mitreTechniqueName}` : ''}${
    alert.threatIntelMatched ? ', with a threat-intel indicator match' : ''
  }. This is a derived triage projection, not an autonomous model verdict — treat it as a starting point for analyst review.`;

  return { verdict, confidence, summary, conclusion, reasoning, evidence };
}
