export type { ConsumerGroupLag, PipelineSignalsDTO, SoakHistoryPoint } from '../pipeline-operations/pipelineOperations.types';

import { PipelineOperationsPage } from '../pipeline-operations/PipelineOperationsPage';

export function PipelineSignalsPage(): JSX.Element {
  const view = new URLSearchParams(window.location.search).get('view');
  return <PipelineOperationsPage initialView={view === 'failures' || view === 'capacity' ? view : 'overview'} />;
}
