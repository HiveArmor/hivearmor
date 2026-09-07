import { describe, expect, it } from 'vitest';

import {
  FIXTURE_DETECTION_PACKS,
  isDetectionContentVisible,
  PLATFORM_DETECTION_PACK_ID,
} from './detectionPack.service';

describe('detectionPack.service isolation', () => {
  it('exposes two tenant fixtures plus the shared platform pack', () => {
    expect(FIXTURE_DETECTION_PACKS.map((pack) => pack.prefix)).toEqual(['platform', 'acme', 'cwm']);
    expect(FIXTURE_DETECTION_PACKS[1]?.customRuleNames).toContain('ACME-CUSTOM-VPN-GEO-ANOMALY');
    expect(FIXTURE_DETECTION_PACKS[2]?.customRuleNames).toContain('CWM-CUSTOM-OT-PROTOCOL-ANOMALY');
  });

  it('never leaks tenant A custom content to tenant B or the platform selector', () => {
    expect(isDetectionContentVisible(0, 1)).toBe(true);
    expect(isDetectionContentVisible(undefined, 2)).toBe(true);
    expect(isDetectionContentVisible(1, 1)).toBe(true);
    expect(isDetectionContentVisible(1, 2)).toBe(false);
    expect(isDetectionContentVisible(2, 1)).toBe(false);
    expect(isDetectionContentVisible(1, PLATFORM_DETECTION_PACK_ID)).toBe(false);
    expect(isDetectionContentVisible(2, null)).toBe(false);
  });
});
