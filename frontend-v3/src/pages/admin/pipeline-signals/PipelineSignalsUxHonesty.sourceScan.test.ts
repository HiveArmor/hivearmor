import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PIPELINE_SIGNALS_JOB_SENTENCE } from './pipelineSignals.honesty';

describe('Pipeline Signals UX honesty (Prompt 41)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/admin/pipeline-signals/PipelineSignalsPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/admin/pipeline-signals/pipelineSignals.honesty.ts'),
    'utf8',
  );
  const operations = readFileSync(
    join(process.cwd(), 'src/pages/admin/pipeline-operations/PipelineOperationsPage.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    join(process.cwd(), 'src/pages/admin/pipeline-operations/PipelineOperations.css'),
    'utf8',
  );
  const service = readFileSync(
    join(process.cwd(), 'src/pages/admin/pipeline-operations/pipelineOperations.service.ts'),
    'utf8',
  );
  const capabilities = readFileSync(
    join(process.cwd(), 'src/services/pipeline.capabilities.ts'),
    'utf8',
  );

  it('states pipeline signals job sentence distinct from data sources and integrations', () => {
    expect(PIPELINE_SIGNALS_JOB_SENTENCE).toMatch(/Pipeline & Ingestion operations/i);
    expect(PIPELINE_SIGNALS_JOB_SENTENCE).toMatch(/Data Sources/i);
    expect(PIPELINE_SIGNALS_JOB_SENTENCE).toMatch(/fail-closed/i);
    expect(page).toContain("variant: 'pipeline-signals'");
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(operations).toContain('STAGING CANDIDATE');
    expect(operations).toContain('pipeline-signals-empty-honesty');
    expect(operations).toContain('ROUTES.INPUTS_SOURCES');
    expect(operations).toContain('Analyst · Platform Administrator');
  });

  it('uses ha-pipeline-signals API and honest projection note', () => {
    expect(service).toContain('/ha-pipeline-signals');
    expect(operations).toContain('pipeline-signals-measured-only-banner');
    expect(honesty).toContain('ING-008');
  });

  it('documents soak partial state and replay fail-closed gates', () => {
    expect(capabilities).toContain('PIPELINE_SOAK_24H_COMPLETE = false');
    expect(operations).toContain('pipeline-onboard-fail-closed');
  });

  it('uses pipeline workspace with empty honesty and min-height 50vh', () => {
    expect(styles).toContain('min-height:50vh');
    expect(styles).toContain('.pipeline-signals-empty-honesty');
    expect(operations).toContain('data-pipeline-signals-honesty');
  });

  it('keeps StatusDock historical for pipeline inventory snapshot', () => {
    expect(operations).toMatch(/mode=["']historical["']/);
  });
});
