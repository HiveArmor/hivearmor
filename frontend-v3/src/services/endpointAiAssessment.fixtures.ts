/**
 * endpointAiAssessment.fixtures — DEV/fixture-only assessments for the Security
 * tab (SPEC-08, W7).
 *
 * Loaded ONLY when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES==='true'`
 * (see endpointAiAssessment.service). This lets us live-verify each of the three
 * HONEST outcomes offline — including the "AI not active" state — without a
 * configured SOC_AI backend. These are fixtures for local rendering verification,
 * never shipped as production data, and the service never imports this file
 * outside fixture mode.
 *
 * The hostname selects the outcome so a reviewer can drive all three states:
 *   - contains "quiet"  → inconclusive (model answered, no confident signal)
 *   - contains "offline"→ unavailable  (AI not configured)
 *   - anything else     → answered      (substantive, grounded)
 */

import type { EndpointAiAssessment } from './endpointAiAssessment.service';

export function getFixtureEndpointAiAssessment(hostname: string): EndpointAiAssessment {
  const key = hostname.toLowerCase();

  if (key.includes('offline')) {
    return {
      outcome: 'unavailable',
      answer:
        'AI service not configured. Set SOC_AI_BASE_URL to enable Hive Intelligence.',
      confidence: 0,
      sources: [],
      durationMs: 0,
      steps: [],
    };
  }

  if (key.includes('quiet')) {
    return {
      outcome: 'inconclusive',
      answer:
        'Insufficient recent telemetry to assess this endpoint. No suspicious activity was observed in the available window, but low signal volume limits confidence.',
      confidence: 0,
      sources: [],
      durationMs: 640,
      steps: [
        { label: 'Signal review', detail: 'No grounded sources cited' },
        { label: 'Assessment', detail: 'Model responded in 640 ms' },
      ],
    };
  }

  return {
    outcome: 'answered',
    answer:
      'This endpoint shows elevated process-creation activity from an unsigned binary in a user temp directory, consistent with a staging or dropper pattern. Two outbound connections to a low-reputation host coincide with the process starts. Recommend isolating the host for triage and collecting the binary for analysis before termination.',
    confidence: 72,
    sources: [
      'process.create event · unsigned binary · %TEMP%\\svc-update.exe',
      'network.connection · 185.203.x.x (low reputation) · 2 flows',
    ],
    durationMs: 1180,
    steps: [
      { label: 'Signal review', detail: '2 grounded sources cited' },
      { label: 'Assessment', detail: 'Model responded in 1180 ms' },
    ],
  };
}
