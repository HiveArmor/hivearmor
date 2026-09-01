/**
 * Admin pipeline signals — measured soak and capacity honesty hub (Prompt 41 / Wave C2 slice 2).
 */

import { useSearchParams } from 'react-router-dom';

import { PIPELINE_SIGNALS_JOB_SENTENCE } from './pipelineSignals.honesty';
import type { PipelineView } from '../pipeline-operations/pipelineOperations.types';
import { PipelineOperationsPage } from '../pipeline-operations/PipelineOperationsPage';


export type { ConsumerGroupLag, PipelineSignalsDTO, SoakHistoryPoint } from '../pipeline-operations/pipelineOperations.types';

export function PipelineSignalsPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const initialView: PipelineView =
    requestedView === 'failures' || requestedView === 'capacity' ? requestedView : 'overview';
  return (
    <PipelineOperationsPage
      initialView={initialView}
      honestyChrome={{ jobSentence: PIPELINE_SIGNALS_JOB_SENTENCE, variant: 'pipeline-signals' }}
    />
  );
}
