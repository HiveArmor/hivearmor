import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_SOURCES_JOB_SENTENCE } from './dataSources.honesty';

describe('Data Sources UX honesty (Prompt 40)', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/pages/inputs/DataSourceStatusPage.tsx'),
    'utf8',
  );
  const honesty = readFileSync(
    join(process.cwd(), 'src/pages/inputs/dataSources.honesty.ts'),
    'utf8',
  );
  const pipeline = readFileSync(
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

  it('states data sources job sentence distinct from integrations, connectors and pipeline flow', () => {
    expect(DATA_SOURCES_JOB_SENTENCE).toMatch(/Data sources operations/i);
    expect(DATA_SOURCES_JOB_SENTENCE).toMatch(/Pipeline Signals/i);
    expect(DATA_SOURCES_JOB_SENTENCE).toMatch(/Data Parsing/i);
    expect(DATA_SOURCES_JOB_SENTENCE).toMatch(/Integrations/i);
    expect(DATA_SOURCES_JOB_SENTENCE).not.toMatch(/PRODUCTION READY/i);
    expect(page).toContain('honestyChrome');
    expect(page).toContain('DATA_SOURCES_JOB_SENTENCE');
    expect(page).toContain("variant: 'data-sources'");
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(pipeline).toContain('STAGING CANDIDATE');
    expect(pipeline).toContain('data-sources-empty-honesty');
    expect(pipeline).toContain('ROUTES.ADMIN_PIPELINE_SIGNALS');
    expect(pipeline).toContain('ROUTES.ADMIN_DATA_PARSING');
    expect(pipeline).toContain('ROUTES.ADMIN_INTEGRATIONS');
    expect(pipeline).toContain('ROUTES.ADMIN_CONNECTORS');
    expect(pipeline).toContain('Analyst · Platform Administrator');
    expect(pipeline).not.toMatch(/href="\/admin\/pipeline-signals/);
    expect(pipeline).not.toMatch(/requires an administrator role/i);
  });

  it('uses canonical /ha-inputs/sources inventory and honest projection note', () => {
    expect(service).toContain('/ha-inputs/sources');
    expect(service).toContain('/ha-pipeline-signals');
    expect(service).toContain('/ha-parsers');
    expect(pipeline).toContain('pipe-page__projection-note');
    expect(pipeline).toContain('ING-001');
    expect(honesty).toContain('ING-002');
  });

  it('documents onboard fail-closed and analyst/admin view gates', () => {
    expect(honesty).toContain('DATA_SOURCES_ONBOARD_FAIL_CLOSED_TITLE');
    expect(pipeline).toContain('DATA_SOURCES_ONBOARD_FAIL_CLOSED_TITLE');
    expect(pipeline).toContain('data-sources-onboard-fail-closed');
    expect(pipeline).toContain('data-sources-onboard-fail-closed-banner');
    expect(page).toContain('initialView="sources"');
  });

  it('uses data sources honesty chrome with empty-state distinction and min-height workspace', () => {
    expect(styles).toContain('.data-sources-empty-honesty');
    expect(styles).toContain('.pipe-page__meta');
    expect(styles).toContain('.pipe-header__badge');
    expect(styles).toContain('min-height:50vh');
    expect(pipeline).toContain('showDataSourcesEmptyHonesty');
    expect(page).toContain("variant: 'data-sources'");
    expect(pipeline).toContain('data-sources-honesty');
  });

  it('keeps StatusDock historical for pipeline inventory snapshot (C2-LIVE-01)', () => {
    expect(pipeline).toMatch(/mode=["']historical["']/);
  });
});
