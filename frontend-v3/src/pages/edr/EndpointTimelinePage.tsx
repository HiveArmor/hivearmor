/**
 * EndpointTimelinePage — T02 (thin route wrapper)
 *
 * Chronological EDR events page at /edr/timeline/:agentId.
 *
 * The timeline experience itself now lives in `EndpointTimelineBody`, which is
 * shared with the consolidated agent-detail page's "Logs / Telemetry" tab
 * (SPEC-03, W3). This wrapper reads `agentId` from the route and renders the
 * body WITH its standalone header, so this route is unchanged (W4 owns retiring
 * it once the consolidated page fully supersedes it).
 */

import { useParams } from 'react-router-dom';

import { EndpointTimelineBody } from './EndpointTimelineBody';

export function EndpointTimelinePage(): JSX.Element {
  const { agentId = '' } = useParams<{ agentId: string }>();
  return <EndpointTimelineBody agentId={agentId} showHeader />;
}
