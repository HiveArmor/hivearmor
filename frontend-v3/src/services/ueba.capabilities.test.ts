import { describe, expect, it } from 'vitest';

import {
  UEBA_ALERT_PIVOT_NOTE,
  UEBA_API_SCOPE_NOTE,
  UEBA_MODEL_HONESTY,
  UEBA_VIEW_DENIED_TITLE,
  canViewUeba,
  uebaEntityDossierPath,
  uebaHuntPath,
  uebaHuntQuery,
} from './ueba.capabilities';

describe('ueba.capabilities', () => {
  it('allows Analyst, SOC Manager, and Platform Administrator only', () => {
    expect(canViewUeba(['ROLE_ANALYST'])).toBe(true);
    expect(canViewUeba(['ROLE_SOC_MANAGER'])).toBe(true);
    expect(canViewUeba(['ROLE_ADMIN'])).toBe(true);
    expect(canViewUeba(['ROLE_SOC_ANALYST'])).toBe(false);
    expect(canViewUeba(['ROLE_USER'])).toBe(false);
    expect(canViewUeba([])).toBe(false);
  });

  it('keeps human role labels in deny copy', () => {
    expect(UEBA_VIEW_DENIED_TITLE).toContain('Analyst');
    expect(UEBA_VIEW_DENIED_TITLE).toContain('SOC Manager');
    expect(UEBA_VIEW_DENIED_TITLE).toContain('Platform Administrator');
    expect(UEBA_VIEW_DENIED_TITLE).not.toContain('ROLE_');
  });

  it('states z-score honesty and refuses trained-model / GenAI claims', () => {
    expect(UEBA_MODEL_HONESTY).toMatch(/z-score/i);
    expect(UEBA_MODEL_HONESTY).toMatch(/not a trained ML model/i);
    expect(UEBA_MODEL_HONESTY).toMatch(/event-processor/i);
    expect(UEBA_MODEL_HONESTY).toMatch(/assist/i);
    expect(UEBA_API_SCOPE_NOTE).toContain('/api/ha-ueba/');
    expect(UEBA_API_SCOPE_NOTE).toContain('/api/uba/');
    expect(UEBA_ALERT_PIVOT_NOTE).toMatch(/do not include alert IDs/i);
  });

  it('builds hunt and dossier pivots from user identifiers', () => {
    expect(uebaHuntQuery('ada"quote')).toBe('user.name:"ada\\"quote"');
    expect(uebaHuntPath('ada')).toBe('/search?q=user.name%3A%22ada%22');
    expect(uebaEntityDossierPath('ada/beta')).toBe('/entities/ada%2Fbeta/dossier');
  });
});
