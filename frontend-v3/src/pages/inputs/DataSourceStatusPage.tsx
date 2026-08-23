import { PipelineOperationsPage } from '@/pages/admin/pipeline-operations/PipelineOperationsPage';

export function DataSourceStatusPage(): JSX.Element {
  return <PipelineOperationsPage initialView="sources" />;
}
