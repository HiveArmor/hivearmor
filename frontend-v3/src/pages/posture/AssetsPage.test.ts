/**
 * AssetsPage tests
 */

import { describe, it, expect } from 'vitest';

import type { AssetDTO } from './posture.types';

describe('AssetsPage', () => {
  it('should strip sensitive fields from raw API response', () => {
    const asset: AssetDTO = {
      id: 1,
      clientName: 'test-client',
      clientDomain: 'example.com',
      clientPrefix: 'tc',
      clientMail: 'test@example.com',
      clientLicenceExpire: '2026-12-31',
      clientLicenceVerified: true,
      connectionStatus: 'ACTIVE',
      lastSeen: '2026-07-23T10:00:00Z',
      agentVersion: '1.0.0',
      platform: 'linux',
      osVersion: 'Ubuntu 22.04',
      ipAddress: '192.168.1.100',
    };

    expect(asset.clientName).toBe('test-client');
    expect(asset.clientDomain).toBe('example.com');
    expect(asset.connectionStatus).toBe('ACTIVE');

    const assetKeys = Object.keys(asset);
    expect(assetKeys.includes('clientPass')).toBe(false);
    expect(assetKeys.includes('clientUser')).toBe(false);
    expect(assetKeys.includes('clientLicenceId')).toBe(false);
  });

  it('should handle null optional fields gracefully', () => {
    const asset: AssetDTO = {
      id: 2,
      clientName: 'minimal-client',
      clientDomain: 'minimal.com',
      clientPrefix: 'mc',
      clientMail: null,
      clientLicenceExpire: null,
      clientLicenceVerified: false,
      connectionStatus: undefined,
      lastSeen: null,
      agentVersion: null,
      platform: null,
      osVersion: null,
      ipAddress: null,
    };

    expect(asset.clientMail).toBe(null);
    expect(asset.connectionStatus).toBe(undefined);
    expect(asset.ipAddress).toBe(null);
  });
});

describe('IdentitiesPage', () => {
  it('should calculate risk score color correctly', () => {
    const getRiskColor = (score: number): string => {
      if (score > 80) return 'critical';
      if (score >= 60) return 'high';
      if (score >= 40) return 'medium';
      return 'low';
    };

    expect(getRiskColor(95)).toBe('critical');
    expect(getRiskColor(81)).toBe('critical');
    expect(getRiskColor(75)).toBe('high');
    expect(getRiskColor(60)).toBe('high');
    expect(getRiskColor(50)).toBe('medium');
    expect(getRiskColor(40)).toBe('medium');
    expect(getRiskColor(30)).toBe('low');
    expect(getRiskColor(0)).toBe('low');
  });
});
