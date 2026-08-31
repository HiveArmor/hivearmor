import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CMP_EVALUATION_HISTORY_READ_AVAILABLE,
  CMP_EXCEPTIONS_READ_AVAILABLE,
  CMP_EXCEPTIONS_WRITE_AVAILABLE,
  CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE,
  CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE,
  CMP_REPORT_SNAPSHOTS_READ_AVAILABLE,
  CMP_REPORT_SNAPSHOTS_WRITE_AVAILABLE,
  CMP_SCHEDULED_REPORTS_READ_AVAILABLE,
  CMP_SCHEDULED_REPORTS_WRITE_AVAILABLE,
  complianceService,
  parseFrameworkStandardId,
} from './compliance.service';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('parseFrameworkStandardId', () => {
  it('returns numeric standard ids from posture framework rows', () => {
    expect(parseFrameworkStandardId('42')).toBe(42);
    expect(parseFrameworkStandardId(' 7 ')).toBe(7);
  });

  it('returns null for non-numeric fixture or slug ids', () => {
    expect(parseFrameworkStandardId('nist-csf-2')).toBeNull();
    expect(parseFrameworkStandardId('')).toBeNull();
    expect(parseFrameworkStandardId('0')).toBeNull();
  });
});

describe('complianceService.resolveFrameworkRepresentativeControl', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it('returns null when framework id is not a numeric standard id', async () => {
    const result = await complianceService.resolveFrameworkRepresentativeControl('hipaa-security');
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns null when standard has no sections', async () => {
    mockGet.mockResolvedValueOnce([]);
    const result = await complianceService.resolveFrameworkRepresentativeControl('3');
    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/compliance/standard-section', {
      params: { 'standardId.equals': 3, size: 50, sort: 'id,asc' },
      signal: undefined,
    });
  });

  it('walks sections until the first control is found', async () => {
    mockGet
      .mockResolvedValueOnce([
        { id: 10, standardId: 3, standardSectionName: 'Access' },
        { id: 11, standardId: 3, standardSectionName: 'Logging' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 55,
          standardSectionId: 11,
          controlName: 'Audit logging',
          lastEvaluationStatus: 'PASS',
        },
      ]);

    const result = await complianceService.resolveFrameworkRepresentativeControl('3');
    expect(result).toEqual({
      standardId: 3,
      sectionId: 11,
      sectionName: 'Logging',
      controlId: 55,
      controlName: 'Audit logging',
    });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/compliance/control-config/get-by-section', {
      params: { sectionId: 10, size: 1, sort: 'id,asc' },
      signal: undefined,
    });
    expect(mockGet).toHaveBeenNthCalledWith(3, '/compliance/control-config/get-by-section', {
      params: { sectionId: 11, size: 1, sort: 'id,asc' },
      signal: undefined,
    });
  });

  it('uses the first control from the first section with catalog rows', async () => {
    mockGet
      .mockResolvedValueOnce([{ id: 20, standardId: 5, standardSectionName: 'Identify' }])
      .mockResolvedValueOnce([
        {
          id: 101,
          standardSectionId: 20,
          controlName: 'Asset inventory',
        },
      ]);

    const result = await complianceService.resolveFrameworkRepresentativeControl('5');
    expect(result).toEqual({
      standardId: 5,
      sectionId: 20,
      sectionName: 'Identify',
      controlId: 101,
      controlName: 'Asset inventory',
    });
  });
});

describe('complianceService.getSectionControlsPage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it('returns items and X-Total-Count for section control picker', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '42' }),
      json: async () => [
        {
          id: 7,
          standardSectionId: 10,
          controlName: 'Access control policy',
        },
      ],
    } as Response);

    const result = await complianceService.getSectionControlsPage({ sectionId: 10, page: 1, size: 25 });
    expect(result).toEqual({
      items: [
        {
          id: 7,
          standardSectionId: 10,
          controlName: 'Access control policy',
        },
      ],
      total: 42,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/compliance/control-config/get-by-section?sectionId=10&page=1&size=25&sort=id%2Casc',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });
});

describe('CMP-009 drawer read contracts', () => {
  it('enables report snapshots after @PreAuthorize is verified on export list GET', () => {
    expect(CMP_EVALUATION_HISTORY_READ_AVAILABLE).toBe(true);
    expect(CMP_REPORT_SNAPSHOTS_READ_AVAILABLE).toBe(true);
  });

  it('loads report snapshots when the contract is available', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        reportName: 'SOC2 export',
        standard: '3',
        status: 'Ready',
        createdDate: '2026-08-21T09:42:00Z',
        createdBy: 'admin',
      },
    ]);
    const rows = await complianceService.getFrameworkReportSnapshots(3);
    expect(rows).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/ha-compliance-report-config', {
      params: { page: 0, size: 20 },
      signal: undefined,
    });
  });

  it('returns PDF export path when report snapshot read is authorized', () => {
    expect(complianceService.getReportSnapshotExportPath(42)).toBe(
      '/api/ha-compliance-report-config/42/export',
    );
  });
});

describe('CMP-009 scheduled report read contracts', () => {
  it('enables scheduled report listing after @PreAuthorize is verified', () => {
    expect(CMP_SCHEDULED_REPORTS_READ_AVAILABLE).toBe(true);
  });

  it('loads scheduled reports when the contract is available', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 2,
        name: 'Monthly HIPAA export',
        frequency: '0 0 1 * *',
        nextRun: '2026-09-01T00:00:00Z',
        status: 'Active',
      },
    ]);
    const rows = await complianceService.getFrameworkScheduledReports(1);
    expect(rows).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/compliance-report-schedules-by-user', {
      params: { page: 0, size: 20, sort: 'id,desc' },
      signal: undefined,
    });
  });
});

describe('CMP-006 governance read contracts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it('enables improvement actions and exceptions when governance read REST is authorized', () => {
    expect(CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE).toBe(true);
    expect(CMP_EXCEPTIONS_READ_AVAILABLE).toBe(true);
  });

  it('loads improvement actions via authorized POA&M read contract', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 1,
        frameworkId: '1',
        controlId: '42',
        title: 'Patch gap',
        description: null,
        dueDate: '2026-09-01',
        status: 'open',
        assignee: 'analyst',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-15T00:00:00Z',
        overdue: false,
      },
    ]);
    const rows = await complianceService.getControlImprovementActions(42);
    expect(rows).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/ha-compliance/poam', {
      params: { controlId: 42, page: 0, size: 20, sort: 'dueDate,asc' },
      signal: undefined,
    });
  });

  it('loads exceptions via authorized read contract', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 2,
        controlId: 42,
        title: 'Legacy auth waiver',
        reason: 'Migration window',
        status: 'approved',
        effectiveFrom: '2026-07-01',
        effectiveUntil: '2026-12-31',
        approver: 'soc-manager',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-15T00:00:00Z',
      },
    ]);
    const rows = await complianceService.getControlExceptions(42);
    expect(rows).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/ha-compliance/exceptions', {
      params: { controlId: 42, page: 0, size: 20, sort: 'effectiveUntil,asc' },
      signal: undefined,
    });
  });
});

describe('CMP-013 governance write contracts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it('enables improvement-action and exception write flags', () => {
    expect(CMP_IMPROVEMENT_ACTIONS_WRITE_AVAILABLE).toBe(true);
    expect(CMP_EXCEPTIONS_WRITE_AVAILABLE).toBe(true);
  });

  it('creates and updates improvement actions via authorized write contract', async () => {
    mockPost.mockResolvedValueOnce({ id: 9, status: 'open', title: 'Enable MFA' });
    mockPut.mockResolvedValueOnce({ id: 9, status: 'closed', title: 'Enable MFA' });

    await complianceService.createImprovementAction({
      frameworkId: '1',
      controlId: 42,
      title: 'Enable MFA',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/ha-compliance/poam',
      { frameworkId: '1', controlId: 42, title: 'Enable MFA' },
      { signal: undefined },
    );

    await complianceService.updateImprovementAction(9, { status: 'closed' });
    expect(mockPut).toHaveBeenCalledWith(
      '/ha-compliance/poam/9',
      { status: 'closed' },
      { signal: undefined },
    );
  });

  it('creates and approves exceptions via authorized write contract', async () => {
    mockPost.mockResolvedValueOnce({ id: 4, status: 'pending', title: 'Vendor SLA exception' });
    mockPatch.mockResolvedValueOnce({ id: 4, status: 'approved', title: 'Vendor SLA exception' });

    await complianceService.createControlException({
      controlId: 42,
      title: 'Vendor SLA exception',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/ha-compliance/exceptions',
      { controlId: 42, title: 'Vendor SLA exception' },
      { signal: undefined },
    );

    await complianceService.approveControlException(4);
    expect(mockPatch).toHaveBeenCalledWith(
      '/ha-compliance/exceptions/4/approve',
      undefined,
      { signal: undefined },
    );
  });
});

describe('CMP-014 report and schedule write contracts', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockPatch.mockReset();
    mockDelete.mockReset();
  });

  it('enables report snapshot and schedule write flags', () => {
    expect(CMP_REPORT_SNAPSHOTS_WRITE_AVAILABLE).toBe(true);
    expect(CMP_SCHEDULED_REPORTS_WRITE_AVAILABLE).toBe(true);
  });

  it('creates and deletes report snapshots via authorized write contract', async () => {
    mockPost.mockResolvedValueOnce({ id: 11, reportName: 'NIST snapshot', standard: '3' });
    mockDelete.mockResolvedValueOnce(undefined);

    await complianceService.createReportSnapshot({
      reportName: 'NIST snapshot',
      standard: '3',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/ha-compliance-report-config',
      { reportName: 'NIST snapshot', standard: '3' },
      { signal: undefined },
    );

    await complianceService.deleteReportSnapshot(11);
    expect(mockDelete).toHaveBeenCalledWith('/ha-compliance-report-config/11', {
      signal: undefined,
    });
  });

  it('creates and deletes schedules via authorized write contract', async () => {
    mockPost.mockResolvedValueOnce({ id: 5, name: 'Weekly export' });
    mockDelete.mockResolvedValueOnce(undefined);

    await complianceService.createComplianceReportSchedule({
      complianceId: 2,
      scheduleString: '0 0 8 * * MON',
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/compliance-report-schedules',
      {
        complianceId: 2,
        scheduleString: '0 0 8 * * MON',
        urlWithParams: '/compliance',
        filterDef: [],
      },
      { signal: undefined },
    );

    await complianceService.deleteComplianceReportSchedule(5);
    expect(mockDelete).toHaveBeenCalledWith('/compliance-report-schedules/5', {
      signal: undefined,
    });
  });

  it('lists report configs by standard for CMP-015 schedule picker', async () => {
    mockGet.mockResolvedValueOnce([
      { id: 1235, configReportName: 'Access Control', configSolution: 'NIST', standardSectionId: 10 },
    ]);
    const rows = await complianceService.getComplianceReportConfigsByStandard(1);
    expect(rows).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledWith('/compliance/report-config/get-by-filters', {
      params: { standardId: 1, page: 0, size: 100, setStatus: false, expandDashboard: false },
      signal: undefined,
    });
  });
});
