/**
 * ReportTemplatesPage — Prompt 35 / Wave C1 slice 5
 */

import { describe, expect, it } from 'vitest';

import { REPORT_TEMPLATES_JOB_SENTENCE, ReportTemplatesPage } from './ReportTemplatesPage';

describe('ReportTemplatesPage', () => {
  it('exports ReportTemplatesPage component', () => {
    expect(ReportTemplatesPage).toBeDefined();
    expect(typeof ReportTemplatesPage).toBe('function');
  });

  it('exports templates job sentence distinct from Studio and Scheduled Reports', () => {
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Report templates/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Studio/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).toMatch(/Scheduled Reports/i);
    expect(REPORT_TEMPLATES_JOB_SENTENCE).not.toMatch(/report generated/i);
  });
});
