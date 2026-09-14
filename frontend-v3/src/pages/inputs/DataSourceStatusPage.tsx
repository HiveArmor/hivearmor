import { useState } from 'react';

import { Gauge, Table2 } from 'lucide-react';

import './DataSourceStatusPage.css';
import { PipelineOperationsPage } from '@/pages/admin/pipeline-operations/PipelineOperationsPage';
import { DATA_SOURCES_JOB_SENTENCE } from '@/pages/inputs/dataSources.honesty';
import { LogCollectionObservabilityView } from '@/pages/inputs/logCollection/LogCollectionObservabilityView';

type DataSourceTab = 'health' | 'inventory';

/**
 * Data Sources page.
 *
 * W8 (SPEC-09) adds a "Collection health" analyst view answering the operator's
 * Agent → Collector → Source → Collection → Parsing → Ingestion → Detection
 * chain from measured signals. The original governed "Inventory" workspace
 * (PipelineOperationsPage, with its fail-closed onboarding + honesty chrome) is
 * preserved verbatim as the second tab — nothing about its discipline changes.
 */
export function DataSourceStatusPage(): JSX.Element {
  const [tab, setTab] = useState<DataSourceTab>('health');

  return (
    <div className="ds-page">
      <nav className="ds-tabs" aria-label="Data sources views">
        <button type="button" role="tab" aria-selected={tab === 'health'} onClick={() => setTab('health')}>
          <Gauge size={13} aria-hidden="true" />
          Collection health
        </button>
        <button type="button" role="tab" aria-selected={tab === 'inventory'} onClick={() => setTab('inventory')}>
          <Table2 size={13} aria-hidden="true" />
          Inventory &amp; onboarding
        </button>
      </nav>

      {tab === 'health' ? (
        <LogCollectionObservabilityView />
      ) : (
        <PipelineOperationsPage
          initialView="sources"
          honestyChrome={{ jobSentence: DATA_SOURCES_JOB_SENTENCE, variant: 'data-sources' }}
        />
      )}
    </div>
  );
}
