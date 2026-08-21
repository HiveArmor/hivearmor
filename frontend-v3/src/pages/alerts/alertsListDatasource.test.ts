/**
 * Tests for Alerts List Datasource
 */

import type { IGetRowsParams } from 'ag-grid-community';
import { describe, it, expect, vi, beforeEach } from 'vitest';


import { createAlertsListDatasource, normalizePayload, buildSearchParams } from './alertsListDatasource';
import type { AlertsListFilters } from './alertsListDatasource';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

describe('createAlertsListDatasource', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    localStorage.clear();
  });

  it('creates a datasource with getRows method', () => {
    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    expect(datasource).toBeDefined();
    expect(typeof datasource.getRows).toBe('function');
  });

  it('calculates correct page number from startRow when no cursor available', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '250' }),
      json: async () => [],
    } as Response);

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const params: IGetRowsParams = {
      startRow: 200,
      endRow: 300,
      successCallback: vi.fn(),
      failCallback: vi.fn(),
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });

  it('includes filter parameters in request', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '100' }),
      json: async () => [],
    } as Response);

    const filters: AlertsListFilters = {
      severity: '4',
      status: '0',
      q: 'test query',
    };

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource(filters, onTotalCount);

    const params: IGetRowsParams = {
      startRow: 0,
      endRow: 100,
      successCallback: vi.fn(),
      failCallback: vi.fn(),
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/severity=4.*status=0.*q=test\+query/),
      expect.any(Object)
    );
  });

  it('maps the client query expression to the canonical q parameter', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '10' }),
      json: async () => [],
    } as Response);

    const datasource = createAlertsListDatasource({
      queryExpression: 'severity:critical OR severity:high',
    }, vi.fn());
    datasource.getRows({
      startRow: 0,
      endRow: 100,
      successCallback: vi.fn(),
      failCallback: vi.fn(),
    } as unknown as IGetRowsParams);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=severity%3Acritical+OR+severity%3Ahigh'),
      expect.any(Object)
    );
    expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('queryExpression='), expect.any(Object));
  });

  it('calls onTotalCount with X-Total-Count header value', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '1250' }),
      json: async () => [],
    } as Response);

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const params: IGetRowsParams = {
      startRow: 0,
      endRow: 100,
      successCallback: vi.fn(),
      failCallback: vi.fn(),
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onTotalCount).toHaveBeenCalledWith(1250);
  });

  it('calls successCallback with data and lastRow when total is known', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    const mockAlerts = [
      { id: '1', name: 'Alert 1', severity: 4 },
      { id: '2', name: 'Alert 2', severity: 3 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '150' }),
      json: async () => mockAlerts,
    } as Response);

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const successCallback = vi.fn();
    const failCallback = vi.fn();

    const params: IGetRowsParams = {
      startRow: 0,
      endRow: 100,
      successCallback,
      failCallback,
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(successCallback).toHaveBeenCalledWith(mockAlerts, -1);
    expect(failCallback).not.toHaveBeenCalled();
  });

  it('calls successCallback with lastRow when reaching the end', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'X-Total-Count': '250' }),
      json: async () => [],
    } as Response);

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const successCallback = vi.fn();
    const failCallback = vi.fn();

    const params: IGetRowsParams = {
      startRow: 200,
      endRow: 300,
      successCallback,
      failCallback,
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(successCallback).toHaveBeenCalledWith([], 250);
  });

  it('calls failCallback on fetch error', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const successCallback = vi.fn();
    const failCallback = vi.fn();

    const params: IGetRowsParams = {
      startRow: 0,
      endRow: 100,
      successCallback,
      failCallback,
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(failCallback).toHaveBeenCalled();
    expect(successCallback).not.toHaveBeenCalled();
  });

  it('calls failCallback on HTTP error response', async () => {
    localStorage.setItem('hivearmor_auth_token', 'test-token');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    const onTotalCount = vi.fn();
    const datasource = createAlertsListDatasource({}, onTotalCount);

    const successCallback = vi.fn();
    const failCallback = vi.fn();

    const params: IGetRowsParams = {
      startRow: 0,
      endRow: 100,
      successCallback,
      failCallback,
    } as unknown as IGetRowsParams;

    datasource.getRows(params);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(failCallback).toHaveBeenCalled();
    expect(successCallback).not.toHaveBeenCalled();
  });

  describe('cursor-based pagination (ALT-014)', () => {
    it('uses nextCursor from envelope for subsequent page requests', async () => {
      localStorage.setItem('hivearmor_auth_token', 'test-token');

      // First page returns cursor envelope
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '1', name: 'Alert 1', severity: 9 }],
          nextCursor: 'abc123-cursor-token',
          hasMore: true,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 500,
        }),
      } as Response);

      const onTotalCount = vi.fn();
      const datasource = createAlertsListDatasource({}, onTotalCount);

      // Fetch first page
      datasource.getRows({
        startRow: 0,
        endRow: 50,
        successCallback: vi.fn(),
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second page should use the cursor
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '2', name: 'Alert 2', severity: 7 }],
          nextCursor: 'def456-cursor-token',
          hasMore: true,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 500,
        }),
      } as Response);

      datasource.getRows({
        startRow: 50,
        endRow: 100,
        successCallback: vi.fn(),
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const secondCallUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain('cursor=abc123-cursor-token');
      expect(secondCallUrl).not.toContain('page=');
    });

    it('extracts totalApproximate from cursor envelope', async () => {
      localStorage.setItem('hivearmor_auth_token', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '1', name: 'Alert 1', severity: 4 }],
          nextCursor: 'cursor-xyz',
          hasMore: true,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 1234,
        }),
      } as Response);

      const onTotalCount = vi.fn();
      const datasource = createAlertsListDatasource({}, onTotalCount);

      datasource.getRows({
        startRow: 0,
        endRow: 50,
        successCallback: vi.fn(),
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onTotalCount).toHaveBeenCalledWith(1234);
    });

    it('handles CURSOR_EXPIRED by refetching from the beginning', async () => {
      localStorage.setItem('hivearmor_auth_token', 'test-token');

      // First page (stores a cursor)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '1', name: 'Alert 1', severity: 9 }],
          nextCursor: 'expired-cursor',
          hasMore: true,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 100,
        }),
      } as Response);

      const onTotalCount = vi.fn();
      const successCallback = vi.fn();
      const datasource = createAlertsListDatasource({}, onTotalCount);

      datasource.getRows({
        startRow: 0,
        endRow: 50,
        successCallback: vi.fn(),
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second page returns CURSOR_EXPIRED (400)
      const cursorExpiredResponse = {
        ok: false,
        status: 400,
        clone: () => ({
          json: async () => ({ errorCode: 'CURSOR_EXPIRED', message: 'Cursor has expired' }),
        }),
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(cursorExpiredResponse);

      // After CURSOR_EXPIRED, the datasource refetches from the beginning
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '1', name: 'Fresh Alert', severity: 9 }],
          nextCursor: 'new-cursor-token',
          hasMore: true,
          snapshotAt: '2026-08-05T12:01:00Z',
          totalApproximate: 100,
        }),
      } as Response);

      datasource.getRows({
        startRow: 50,
        endRow: 100,
        successCallback,
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // The reset fetch should NOT include the expired cursor
      const resetCallUrl = mockFetch.mock.calls[2][0] as string;
      expect(resetCallUrl).not.toContain('cursor=expired-cursor');
      expect(successCallback).toHaveBeenCalledWith(
        [{ id: '1', name: 'Fresh Alert', severity: 9 }],
        expect.any(Number)
      );
    });

    it('sends page/size on first page even when backend returns cursor envelope', async () => {
      localStorage.setItem('hivearmor_auth_token', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [],
          nextCursor: null,
          hasMore: false,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 0,
        }),
      } as Response);

      const datasource = createAlertsListDatasource({}, vi.fn());

      datasource.getRows({
        startRow: 0,
        endRow: 50,
        successCallback: vi.fn(),
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const firstCallUrl = mockFetch.mock.calls[0][0] as string;
      expect(firstCallUrl).toContain('page=0');
      expect(firstCallUrl).toContain('size=');
    });

    it('signals end of data when hasMore is false', async () => {
      localStorage.setItem('hivearmor_auth_token', 'test-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          items: [{ id: '1', name: 'Last Alert', severity: 3 }],
          nextCursor: null,
          hasMore: false,
          snapshotAt: '2026-08-05T12:00:00Z',
          totalApproximate: 1,
        }),
      } as Response);

      const successCallback = vi.fn();
      const datasource = createAlertsListDatasource({}, vi.fn());

      datasource.getRows({
        startRow: 0,
        endRow: 50,
        successCallback,
        failCallback: vi.fn(),
      } as unknown as IGetRowsParams);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // When hasMore is false, lastRow should be total (1)
      expect(successCallback).toHaveBeenCalledWith(
        [{ id: '1', name: 'Last Alert', severity: 3 }],
        1
      );
    });
  });
});

describe('normalizePayload', () => {
  it('handles cursor-based envelope', () => {
    const result = normalizePayload({
      items: [{ id: '1', name: 'Alert' }],
      nextCursor: 'abc',
      hasMore: true,
      snapshotAt: '2026-08-05T12:00:00Z',
      totalApproximate: 500,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBe('abc');
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(500);
  });

  it('handles legacy envelope (alerts key)', () => {
    const result = normalizePayload({
      alerts: [{ id: '1', name: 'Alert' }],
      total: 100,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBeNull();
    expect(result.total).toBe(100);
  });

  it('handles raw array payload', () => {
    const result = normalizePayload([{ id: '1', name: 'Alert' }]);

    expect(result.rows).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(result.total).toBeNull();
  });

  it('handles null/undefined payload', () => {
    expect(normalizePayload(null).rows).toHaveLength(0);
    expect(normalizePayload(undefined).rows).toHaveLength(0);
  });
});

describe('buildSearchParams', () => {
  it('includes cursor param when cursor is provided', () => {
    const params = buildSearchParams({}, 50, 100, [], 'test-cursor');
    expect(params.get('cursor')).toBe('test-cursor');
    expect(params.has('page')).toBe(false);
  });

  it('includes page/size when no cursor is provided', () => {
    const params = buildSearchParams({}, 100, 200, [], null);
    expect(params.get('page')).toBe('1');
    expect(params.get('size')).toBe('100');
    expect(params.has('cursor')).toBe(false);
  });

  it('uses canonical sort format with direction prefix', () => {
    const params = buildSearchParams(
      {},
      0,
      50,
      [{ colId: 'severity', sort: 'desc' }],
      null
    );
    expect(params.get('sort')).toBe('-severity,id');
  });

  it('uses + prefix for ascending sort', () => {
    const params = buildSearchParams(
      {},
      0,
      50,
      [{ colId: '@timestamp', sort: 'asc' }],
      null
    );
    expect(params.get('sort')).toBe('+@timestamp,id');
  });

  it('maps timestamp colId to @timestamp for the alerts API', () => {
    const params = buildSearchParams(
      {},
      0,
      50,
      [{ colId: 'timestamp', sort: 'desc' }],
      null
    );
    expect(params.get('sort')).toBe('-@timestamp,id');
  });
});
