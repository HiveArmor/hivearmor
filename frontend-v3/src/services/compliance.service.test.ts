import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CMP_EVALUATION_HISTORY_READ_AVAILABLE,
  CMP_EXCEPTIONS_READ_AVAILABLE,
  CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE,
  CMP_REPORT_SNAPSHOTS_READ_AVAILABLE,
  complianceService,
  parseFrameworkStandardId,
} from './compliance.service';

const mockGet = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
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

describe('CMP-007 drawer read contracts', () => {
  it('enables evaluation history and keeps report snapshots fail-closed', () => {
    expect(CMP_EVALUATION_HISTORY_READ_AVAILABLE).toBe(true);
    expect(CMP_REPORT_SNAPSHOTS_READ_AVAILABLE).toBe(false);
  });

  it('rejects report snapshot reads while the contract is unavailable', async () => {
    await expect(complianceService.getFrameworkReportSnapshots(1)).rejects.toThrow(
      /not authorized yet/i,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('CMP-006 governance read contracts', () => {
  it('keeps improvement actions and exceptions fail-closed until REST is authorized', () => {
    expect(CMP_IMPROVEMENT_ACTIONS_READ_AVAILABLE).toBe(false);
    expect(CMP_EXCEPTIONS_READ_AVAILABLE).toBe(false);
  });

  it('rejects improvement-action reads while the contract is unavailable', async () => {
    await expect(complianceService.getControlImprovementActions(42)).rejects.toThrow(
      /not authorized yet/i,
    );
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects exception reads while the contract is unavailable', async () => {
    await expect(complianceService.getControlExceptions(42)).rejects.toThrow(/not authorized yet/i);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
