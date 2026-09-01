import { PipelineOperationsPage } from '@/pages/admin/pipeline-operations/PipelineOperationsPage';
import { DATA_SOURCES_JOB_SENTENCE } from '@/pages/inputs/dataSources.honesty';

export function DataSourceStatusPage(): JSX.Element {
  return (
    <PipelineOperationsPage
      initialView="sources"
      honestyChrome={{ jobSentence: DATA_SOURCES_JOB_SENTENCE }}
    />
  );
}
