/**
 * DET-MSSP-001 — tenant detection pack isolation (STAGING CANDIDATE).
 *
 * Platform pack (tenantId 0 / null) is shared. Tenant custom packs never leak
 * across tenants. Live calls send X-Tenant-ID when a tenant pack is selected.
 */

const TOKEN_KEY = 'hivearmor_auth_token';
const PACK_TENANT_KEY = 'ha_detection_pack_tenant_id';
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export const DETECTION_PACK_HONESTY =
  'STAGING CANDIDATE — MSSP detection packs are tenant-scoped. Switching tenants never lists another tenant’s custom rules or exceptions. The platform pack stays shared. Event-processor YAML sync still writes only platform (null tenant_id) rules into the shared workdir.';

export interface DetectionPackOption {
  tenantId: number;
  prefix: string;
  label: string;
  shared: boolean;
  customRuleNames: string[];
}

export const PLATFORM_DETECTION_PACK_ID = 0;

export const FIXTURE_DETECTION_PACKS: DetectionPackOption[] = [
  {
    tenantId: PLATFORM_DETECTION_PACK_ID,
    prefix: 'platform',
    label: 'Platform pack (shared)',
    shared: true,
    customRuleNames: [],
  },
  {
    tenantId: 1,
    prefix: 'acme',
    label: 'Acme MSSP · custom pack',
    shared: false,
    customRuleNames: ['ACME-CUSTOM-VPN-GEO-ANOMALY', 'ACME-CUSTOM-PAYROLL-EXFIL'],
  },
  {
    tenantId: 2,
    prefix: 'cwm',
    label: 'CWM · custom pack',
    shared: false,
    customRuleNames: ['CWM-CUSTOM-OT-PROTOCOL-ANOMALY', 'CWM-CUSTOM-CONTRACTOR-RDP'],
  },
];

export function isDetectionContentVisible(
  resourceTenantId: number | null | undefined,
  requestTenantId: number | null | undefined,
): boolean {
  const resource = resourceTenantId ?? PLATFORM_DETECTION_PACK_ID;
  const request = requestTenantId ?? PLATFORM_DETECTION_PACK_ID;
  if (resource === PLATFORM_DETECTION_PACK_ID) return true;
  if (request === PLATFORM_DETECTION_PACK_ID) return false;
  return resource === request;
}

export function readDetectionPackTenantId(): number {
  if (typeof sessionStorage === 'undefined') {
    return fixtureMode ? 1 : PLATFORM_DETECTION_PACK_ID;
  }
  try {
    const raw = sessionStorage.getItem(PACK_TENANT_KEY);
    if (raw === null || raw === '') {
      return fixtureMode ? 1 : PLATFORM_DETECTION_PACK_ID;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : PLATFORM_DETECTION_PACK_ID;
  } catch {
    return fixtureMode ? 1 : PLATFORM_DETECTION_PACK_ID;
  }
}

export function writeDetectionPackTenantId(tenantId: number): void {
  try {
    sessionStorage.setItem(PACK_TENANT_KEY, String(tenantId));
  } catch {
    // Private mode — selection still applies for this page session via callers.
  }
}

export function detectionPackAuthHeaders(): Record<string, string> {
  const tenantId = readDetectionPackTenantId();
  const headers: Record<string, string> = {};
  if (tenantId > PLATFORM_DETECTION_PACK_ID) {
    headers['X-Tenant-ID'] = String(tenantId);
  }
  return headers;
}

interface DetectionPackWire {
  tenantId?: number | null;
  prefix?: string;
  label?: string;
  shared?: boolean;
}

export async function fetchDetectionPacks(signal?: AbortSignal): Promise<{
  packs: DetectionPackOption[];
  honesty: string;
}> {
  if (fixtureMode) {
    signal?.throwIfAborted();
    return { packs: FIXTURE_DETECTION_PACKS, honesty: DETECTION_PACK_HONESTY };
  }

  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const response = await fetch('/api/ha-detection-packs', {
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...detectionPackAuthHeaders(),
    },
  });
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }
  if (!response.ok) {
    throw new Error(`Failed to list detection packs (HTTP ${response.status})`);
  }
  const body = await response.json() as { packs?: DetectionPackWire[]; honesty?: string };
  const packs: DetectionPackOption[] = (body.packs ?? []).map((pack) => ({
    tenantId: pack.tenantId ?? PLATFORM_DETECTION_PACK_ID,
    prefix: pack.prefix ?? 'platform',
    label: pack.label ?? 'Platform pack (shared)',
    shared: Boolean(pack.shared),
    customRuleNames: [],
  }));
  if (!packs.some((pack) => pack.tenantId === PLATFORM_DETECTION_PACK_ID)) {
    packs.unshift(FIXTURE_DETECTION_PACKS[0]);
  }
  return { packs, honesty: typeof body.honesty === 'string' ? body.honesty : DETECTION_PACK_HONESTY };
}
