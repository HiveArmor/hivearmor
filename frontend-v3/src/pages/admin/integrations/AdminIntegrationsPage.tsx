/**
 * Admin integrations — connector operations honesty hub (Prompt 37 / Wave C2 slice 2).
 *
 * Production inventory: GET /api/ha-integrations (ADMIN-gated), notification rules, API keys.
 * Connector validate/activate and vendor live proofs remain fail-closed (INO-001–INO-004).
 */

import { useSearchParams } from 'react-router-dom';

import { INTEGRATIONS_JOB_SENTENCE } from './adminIntegrations.honesty';
import type { IntegrationView } from '../integration-operations/integrationOperations.types';
import { IntegrationOperationsPage } from '../integration-operations/IntegrationOperationsPage';

export function AdminIntegrationsPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const initialView: IntegrationView =
    requestedView === 'connectors' || requestedView === 'activity' ? requestedView : 'overview';
  return (
    <IntegrationOperationsPage
      initialView={initialView}
      honestyChrome={{ jobSentence: INTEGRATIONS_JOB_SENTENCE }}
    />
  );
}
