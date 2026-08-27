import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENTITY_DOSSIER_JOB_SENTENCE } from './EntityDossierPage';
import { ENTITIES_JOB_SENTENCE } from './EntityInventoryPage';

describe('Prompt 12 Entities UX honesty', () => {
  const inventory = readFileSync(join(process.cwd(), 'src/pages/entities/EntityInventoryPage.tsx'), 'utf8');
  const dossier = readFileSync(join(process.cwd(), 'src/pages/entities/EntityDossierPage.tsx'), 'utf8');
  const inventoryCss = readFileSync(join(process.cwd(), 'src/pages/entities/EntityInventoryPage.css'), 'utf8');
  const entitiesService = readFileSync(join(process.cwd(), 'src/services/entities.service.ts'), 'utf8');
  const routerSource = readFileSync(join(process.cwd(), 'src/router/index.tsx'), 'utf8');

  it('exports inventory job sentence for entity pivots', () => {
    expect(ENTITIES_JOB_SENTENCE).toMatch(/Entity inventory/i);
    expect(ENTITIES_JOB_SENTENCE).toMatch(/risk|dossier|pivot/i);
    expect(inventory).toContain('ENTITIES_JOB_SENTENCE');
  });

  it('exports dossier job sentence and confirmed API wiring', () => {
    expect(ENTITY_DOSSIER_JOB_SENTENCE).toMatch(/Risk dossier|dossier/i);
    expect(dossier).toContain('getDossier');
    expect(dossier).toContain('getRelatedAlerts');
    expect(dossier).toContain('getActivity');
    expect(dossier).toContain('shellIdentity');
    expect(dossier).not.toContain('fetchEntityDetail');
    expect(dossier).not.toContain('BaselineMetricsPanel');
    expect(dossier).not.toContain('RelationshipGraphPanel');
  });

  it('keeps sibling meta links on inventory and dossier', () => {
    expect(inventory).toContain('to="/search"');
    expect(inventory).toContain('to="/alerts"');
    expect(inventory).toContain('to="/investigations"');
    expect(inventory).toContain('to="/incidents"');
    expect(inventory).toContain('to="/posture/sensors"');
    expect(dossier).toContain('to={`/search?q=');
    expect(dossier).toContain('to="/investigations"');
    expect(dossier).toContain('to="/incidents"');
    expect(dossier).toContain("navigate(`/search?q=");
  });

  it('opens inventory rows into canonical dossier route', () => {
    expect(inventory).toContain('/entities/${encodeURIComponent(entity.id)}/dossier');
    expect(inventoryCss).toContain('min-height: 50vh');
  });

  it('wires confirmed risk path in entities service', () => {
    expect(entitiesService).toContain('/dossier');
    expect(entitiesService).toContain('fetchEntityRisk');
    expect(entitiesService).toContain('/activity');
  });

  it('keeps /entities/:id redirect to dossier without EntityDetailPage', () => {
    expect(routerSource).toContain('EntityIdToDossierRedirect');
    expect(routerSource).toContain('/entities/${encodeURIComponent(id)}/dossier');
    expect(routerSource).not.toContain('EntityDetailPage');
  });

  it('uses human role labels for access denial', () => {
    expect(dossier).toContain('ROLE_LABELS');
    expect(dossier).toMatch(/Required permission:/);
  });
});
