import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getFoundationConstellation, getFoundationExpansion, getFoundationRelationshipEvidence,
} from './constellation.fixtures';

import type { ConstellationFilters } from '@/types/constellation.types';

const filters: ConstellationFilters = {
  entityTypes: ['host', 'user', 'ip', 'process', 'file', 'domain', 'service', 'cloud'],
  edgeTypes: ['CONNECTED_TO', 'SPAWNED', 'LOGGED_IN_FROM', 'RESOLVED_TO', 'CONTAINS', 'ACCESSED', 'AUTHENTICATED_TO', 'COMMUNICATED_WITH', 'EXECUTED_ON'],
  depth: 2,
  timeRange: '24h',
  minRisk: 0,
  limit: 150,
};

describe('threat constellation fixtures', () => {
  it('returns bounded, internally consistent nodes and relationships', async () => {
    const result = await getFoundationConstellation(filters);
    const nodeIds = new Set(result.nodes.map((node) => node.id));
    expect(nodeIds.size).toBe(result.nodes.length);
    expect(new Set(result.edges.map((edge) => edge.id)).size).toBe(result.edges.length);
    expect(result.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
    expect(result.nodes.every((node) => node.sources?.length)).toBe(true);
    expect(result.nodes.length).toBeLessThanOrEqual(150);
  });

  it('supports a seed entity, hop expansion, type filters, and risk thresholds', async () => {
    const result = await getFoundationConstellation({ ...filters, seedEntity: 'entity-host-00001', depth: 1, entityTypes: ['host', 'user', 'ip'], minRisk: 80 });
    expect(result.nodes.some((node) => node.entityId === 'entity-host-00001')).toBe(true);
    expect(result.nodes.every((node) => ['host', 'user', 'ip'].includes(node.entityType))).toBe(true);
    expect(result.nodes.every((node) => node.riskScore >= 80)).toBe(true);
  });

  it('provides snapshot expansion and progressive relationship evidence fixtures', async () => {
    const graph = await getFoundationConstellation(filters);
    const expansion = await getFoundationExpansion(graph.snapshotId as string, graph.nodes[0].id);
    const evidence = await getFoundationRelationshipEvidence(graph.edges[0].id);
    expect(expansion.snapshotId).toBe(graph.snapshotId);
    expect(evidence.events.length).toBeGreaterThan(0);
    expect(evidence.summary.totalEvents).toBeGreaterThan(0);
    expect(evidence.sourceEntity.id).toBeTruthy();
    expect(evidence.targetEntity.id).toBeTruthy();
  });

  it('keeps constellation records behind the production alias boundary', () => {
    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    const buildScript = readFileSync(join(process.cwd(), 'scripts/build.mjs'), 'utf8');
    expect(viteConfig).toContain('constellation.fixture-disabled.ts');
    expect(buildScript).toContain('--alias:@/pages/constellation/constellation.fixtures=./src/pages/constellation/constellation.fixture-disabled.ts');
  });
});

describe('threat constellation design contract', () => {
  it('provides graph/list parity, sticky controls, pivots, status, and semantic tokens', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/constellation/ThreatConstellationPage.tsx'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'src/pages/constellation/NodeDetailPanel.tsx'), 'utf8');
    const canvas = readFileSync(join(process.cwd(), 'src/pages/constellation/ThreatConstellationCanvas.tsx'), 'utf8');
    const navigation = readFileSync(join(process.cwd(), 'src/components/ha-navigation/HaNavigation.tsx'), 'utf8');
    const styles = readFileSync(join(process.cwd(), 'src/pages/constellation/ThreatConstellationPage.css'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'src/services/constellation.service.ts'), 'utf8');
    expect(page).toContain('Accessible graph inventory');
    expect(page).toContain('role="listbox"');
    expect(detail).toContain('Hunt entity');
    expect(page).toContain('StatusDock');
    expect(page).toContain('queryFn: ({ signal })');
    expect(page).toContain('useConstellationSnapshotStream');
    expect(detail).toContain('Supporting evidence');
    expect(page).toContain('CONSTELLATION_JOB_SENTENCE');
    expect(page).toContain('constellation-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('/intelligence');
    expect(service).toContain('/ha-constellation');
    expect(service).toContain('expandConstellation');
    expect(styles).toContain('.constellation-toolbar');
    expect(styles).toContain('scrollbar-width: thin');
    expect(page).toContain('constellation-page--focus');
    expect(page).toContain('constellation-workspace--detail');
    expect(detail).toContain('return null');
    expect(canvas).toContain('entityBadgeSymbol');
    expect(canvas).toContain("edgeSymbol: ['none', 'arrow']");
    expect(canvas).toContain("type: 'lines'");
    expect(canvas).toContain('constantSpeed:');
    expect(canvas).toContain('scale: false');
    expect(canvas).toContain('draggable: true');
    expect(canvas).toContain('persistDraggedPositions');
    expect(canvas).toContain("renderer.on('mouseup'");
    expect(navigation).toContain("route: '/constellation'");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
