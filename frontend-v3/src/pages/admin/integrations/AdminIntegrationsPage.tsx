import { useSearchParams } from 'react-router-dom';

import type { IntegrationView } from '../integration-operations/integrationOperations.types';
import { IntegrationOperationsPage } from '../integration-operations/IntegrationOperationsPage';

export function AdminIntegrationsPage():JSX.Element{
  const [searchParams]=useSearchParams();
  const requestedView=searchParams.get('view');
  const initialView:IntegrationView=requestedView==='connectors'||requestedView==='activity'?requestedView:'overview';
  return <IntegrationOperationsPage initialView={initialView}/>;
}
