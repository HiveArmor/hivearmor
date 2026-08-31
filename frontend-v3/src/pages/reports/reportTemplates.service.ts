/**
 * Report templates inventory — Prompt 35 / Wave C1 slice 5.
 *
 * Live inventory: GET /api/ha-reports?repType=TEMPLATE (legacy UtmReport TEMPLATE rows).
 * Dedicated /api/ha-reports/templates CRUD and governed generation remain unavailable (GAP-BE-09 / REP).
 * Fixtures never ship to production (vite aliases fixture-disabled).
 */

import type { ReportTemplate } from './reportingOperations.types';
import { fetchReportsByType } from './reports.service';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export interface ReportTemplateInventory {
  items: ReportTemplate[];
  total: number;
  tenantScoped: boolean;
  bounded: boolean;
  snapshotAt: string;
  /** True when inventory comes from legacy TEMPLATE rows, not a templates contract. */
  legacyProjection: boolean;
}

function normalizeTemplateType(module: string | null | undefined): ReportTemplate['type'] {
  const value = String(module ?? '').toLocaleUpperCase();
  if (value.includes('INCIDENT')) return 'INCIDENT';
  if (value.includes('AFTER')) return 'AFTER_ACTION';
  if (value.includes('EXEC')) return 'EXECUTIVE';
  if (
    value.includes('COMPLIANCE') ||
    value.includes('PCI') ||
    value.includes('HIPAA') ||
    value.includes('NIST') ||
    value.includes('ISO')
  ) {
    return 'COMPLIANCE';
  }
  return 'SITREP';
}

export const CREATE_TEMPLATE_FAIL_CLOSED_TITLE =
  'Required permission: SOC Manager or Platform Administrator — and the canonical template builder contract is unavailable (GAP-BE-09).';

export const GENERATE_FROM_TEMPLATE_FAIL_CLOSED_TITLE =
  'Governed report generation is not available from templates inventory. Use Scheduled Reports for schedule ops; do not treat this as generation success.';

export const reportTemplatesService = {
  fixtureMode,

  async list(signal?: AbortSignal): Promise<ReportTemplateInventory> {
    if (fixtureMode) {
      const { reportingOperationsFixture } = await import('./reportingOperations.fixtures');
      const items = structuredClone(reportingOperationsFixture.templates);
      return {
        items,
        total: items.length,
        tenantScoped: reportingOperationsFixture.tenantScoped,
        bounded: reportingOperationsFixture.bounded,
        snapshotAt: reportingOperationsFixture.snapshotAt,
        legacyProjection: false,
      };
    }

    const rows = await fetchReportsByType('TEMPLATE', signal);
    const items: ReportTemplate[] = rows.map((item) => ({
      id: String(item.id),
      name: item.repName,
      type: normalizeTemplateType(item.repModule),
      description: item.repDescription ?? 'Description not reported by legacy API',
      version: 1,
      owner: item.modificationUser ?? item.creationUser ?? 'Not reported',
      managed: item.creationUser === 'system',
      sections: 0,
      dataSources: 0,
      redactionProfile: 'Not reported',
      updatedAt: item.modificationDate ?? item.creationDate,
      status: 'published',
    }));

    return {
      items,
      total: items.length,
      tenantScoped: false,
      bounded: false,
      snapshotAt: new Date().toISOString(),
      legacyProjection: true,
    };
  },
};
