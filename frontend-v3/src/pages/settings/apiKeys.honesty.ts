/** Bundle-visible job sentence — service access keys, not connector secrets or enrollment tokens. */
export const API_KEYS_JOB_SENTENCE =
  'Service access keys — issue least-privileged credentials for automation, collectors, and integrations under Platform Administrator control. Legacy connector secret aliases live on Integrations; typed connector instances on Connectors; enrollment audit on Enrollment audit — rotation policies, scoped delegation, and immutable issuance audit remain fail-closed until AKM contracts land.';

export const API_KEYS_PROJECTION_NOTE =
  'Inventory via GET /api/ha-admin/api-keys (metadata only — plaintext token and bcrypt hash never returned). Create and revoke are live for Platform Administrators. Scoped delegation, rotation schedules, and immutable issuance audit ledger are not authoritative until AKM-001–AKM-003 land.';

export const API_KEYS_ROTATION_FAIL_CLOSED_TITLE =
  'Rotation schedules and scoped delegation remain unavailable until AKM-001–AKM-003 publish governed lifecycle contracts.';
