import { describe, expect, it } from 'vitest';

import {
  CONNECTOR_PROMOTE_ADMIN_ONLY,
  CONNECTOR_VENDOR_LIVE_VERIFIED,
} from './connector.capabilities';

describe('connector.capabilities (STAGING CANDIDATE)', () => {
  it('keeps vendor live unverified until proofs land', () => {
    expect(CONNECTOR_VENDOR_LIVE_VERIFIED).toBe(false);
  });

  it('keeps promote admin-only aligned with backend PreAuthorize', () => {
    expect(CONNECTOR_PROMOTE_ADMIN_ONLY).toBe(true);
  });
});
