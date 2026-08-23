import { describe, expect, it } from 'vitest';

import { filterProductionSsoProviders, isProductionSsoProviderName } from './ssoProviders';

describe('ssoProviders', () => {
  it('accepts production identity names', () => {
    expect(isProductionSsoProviderName('Northwind Identity')).toBe(true);
    expect(isProductionSsoProviderName('Okta')).toBe(true);
    expect(isProductionSsoProviderName('Google Workspace')).toBe(true);
    expect(isProductionSsoProviderName('Microsoft Entra ID')).toBe(true);
  });

  it('rejects lab and non-production names', () => {
    expect(isProductionSsoProviderName('Google Workspace Test')).toBe(false);
    expect(isProductionSsoProviderName('Google Workspace Test 2')).toBe(false);
    expect(isProductionSsoProviderName('T06-Check1-Provider')).toBe(false);
    expect(isProductionSsoProviderName('Chk2 Provider')).toBe(false);
    expect(isProductionSsoProviderName('Local Dev IdP')).toBe(false);
    expect(isProductionSsoProviderName('Sandbox SSO')).toBe(false);
    expect(isProductionSsoProviderName('')).toBe(false);
  });

  it('filters provider lists for the login gate', () => {
    const filtered = filterProductionSsoProviders([
      { id: 1, providerName: 'Okta', discoveryUrl: 'https://okta.example' },
      { id: 2, providerName: 'Google Workspace Test', discoveryUrl: 'https://test.example' },
      { id: 3, providerName: 'T06-Check1-Provider', discoveryUrl: 'https://check.example' },
      { id: 4, providerName: 'Microsoft Entra ID', discoveryUrl: 'https://entra.example' },
    ]);
    expect(filtered.map((p) => p.providerName)).toEqual(['Okta', 'Microsoft Entra ID']);
  });
});
