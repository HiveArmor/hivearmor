import { describe, expect, it } from 'vitest';

import {
  MITRE_TACTIC_ORDER,
  UNMAPPED_TACTIC,
  buildMitreHeatmap,
  coverageBand,
  coverageFromInventoryRules,
  parentTechniqueId,
  parseCoverageRow,
  parseTechniqueId,
  resolveTactic,
  tacticHintsFromInventory,
} from './mitreHeatmap';

describe('parseTechniqueId', () => {
  it('extracts canonical ids from labeled correlation-rule strings', () => {
    expect(parseTechniqueId('T1059.001 - PowerShell')).toBe('T1059.001');
    expect(parseTechniqueId('t1110')).toBe('T1110');
    expect(parseTechniqueId('  T1003.001  ')).toBe('T1003.001');
  });

  it('returns null when no ATT&CK id is present', () => {
    expect(parseTechniqueId('Credential Access')).toBeNull();
    expect(parseTechniqueId('')).toBeNull();
  });
});

describe('parseCoverageRow', () => {
  it('keeps the label after a technique id', () => {
    expect(parseCoverageRow('T1059.001 - PowerShell')).toEqual({
      techniqueId: 'T1059.001',
      techniqueName: 'PowerShell',
    });
  });

  it('uses the catalog name when the API returns a bare id', () => {
    expect(parseCoverageRow('T1110').techniqueName).toBe('Brute Force');
  });
});

describe('parentTechniqueId and tactic resolution', () => {
  it('strips subtechnique suffixes', () => {
    expect(parentTechniqueId('T1059.001')).toBe('T1059');
    expect(parentTechniqueId('T1110')).toBe('T1110');
  });

  it('maps subtechniques to the parent primary tactic', () => {
    expect(resolveTactic('T1059.001')).toBe('Execution');
    expect(resolveTactic('T1003.001')).toBe('Credential Access');
    expect(resolveTactic('T1021.002')).toBe('Lateral Movement');
  });

  it('prefers an inventory tactic hint over the catalog', () => {
    expect(resolveTactic('T1078', 'Defense Evasion')).toBe('Defense Evasion');
  });

  it('keeps unknown ids in Unmapped', () => {
    expect(resolveTactic('not-a-technique')).toBe(UNMAPPED_TACTIC);
    expect(resolveTactic('T9999')).toBe(UNMAPPED_TACTIC);
  });
});

describe('coverageBand', () => {
  it('bands active rule counts without inventing coverage', () => {
    expect(coverageBand(0)).toBe('none');
    expect(coverageBand(1)).toBe('low');
    expect(coverageBand(2)).toBe('low');
    expect(coverageBand(3)).toBe('medium');
    expect(coverageBand(5)).toBe('medium');
    expect(coverageBand(6)).toBe('high');
  });
});

describe('coverageFromInventoryRules', () => {
  it('aggregates mapped inventory rules by canonical technique id', () => {
    const rows = coverageFromInventoryRules([
      { techniqueId: 'T1110', ruleActive: true },
      { techniqueId: 'T1110', ruleActive: false },
      { techniqueId: 'T1059.001 - PowerShell', ruleActive: true },
      { techniqueId: '', ruleActive: true },
    ]);
    expect(rows).toEqual([
      { technique: 'T1059.001', ruleCount: 1, activeCount: 1 },
      { technique: 'T1110', ruleCount: 2, activeCount: 1 },
    ]);
  });
});

describe('buildMitreHeatmap', () => {
  it('projects coverage API rows onto the 14 Enterprise tactic columns', () => {
    const heatmap = buildMitreHeatmap([
      { technique: 'T1059.001 - PowerShell', ruleCount: 4, activeCount: 3 },
      { technique: 'T1110', ruleCount: 2, activeCount: 0 },
      { technique: 'T1021.002', ruleCount: 1, activeCount: 1 },
    ]);

    expect(heatmap.columns).toHaveLength(MITRE_TACTIC_ORDER.length);
    expect(heatmap.mappedTechniques).toBe(3);
    expect(heatmap.activeTechniques).toBe(2);
    expect(heatmap.inactiveTechniques).toBe(1);
    expect(heatmap.coveredTactics).toBe(2);
    expect(heatmap.hasUnmapped).toBe(false);

    const execution = heatmap.columns.find((column) => column.tactic === 'Execution');
    expect(execution?.cells[0]).toMatchObject({
      techniqueId: 'T1059.001',
      techniqueName: 'PowerShell',
      band: 'medium',
      ruleCount: 4,
      activeCount: 3,
    });

    const credential = heatmap.columns.find((column) => column.tactic === 'Credential Access');
    expect(credential?.cells[0]).toMatchObject({
      techniqueId: 'T1110',
      band: 'none',
      activeCount: 0,
    });
  });

  it('merges duplicate technique labels from the coverage API', () => {
    const heatmap = buildMitreHeatmap([
      { technique: 'T1110', ruleCount: 1, activeCount: 1 },
      { technique: 'T1110 - Brute Force', ruleCount: 2, activeCount: 1 },
    ]);
    expect(heatmap.cells).toHaveLength(1);
    expect(heatmap.cells[0]).toMatchObject({
      techniqueId: 'T1110',
      ruleCount: 3,
      activeCount: 2,
      band: 'low',
    });
  });

  it('adds an Unmapped column only when a row cannot be placed', () => {
    const heatmap = buildMitreHeatmap([{ technique: 'Custom pack tag', ruleCount: 1, activeCount: 1 }]);
    expect(heatmap.hasUnmapped).toBe(true);
    expect(heatmap.columns).toHaveLength(MITRE_TACTIC_ORDER.length + 1);
    expect(heatmap.columns[heatmap.columns.length - 1]?.tactic).toBe(UNMAPPED_TACTIC);
    expect(heatmap.columns[heatmap.columns.length - 1]?.cells[0]?.techniqueId).toBe('Custom pack tag');
  });

  it('uses inventory tactic hints when the coverage API has no tactic field', () => {
    const hints = tacticHintsFromInventory([
      { techniqueId: 'T1078', tactic: 'Defense Evasion', ruleActive: true },
    ]);
    const heatmap = buildMitreHeatmap(
      [{ technique: 'T1078', ruleCount: 1, activeCount: 1 }],
      { tacticHints: hints, techniqueNames: { T1078: 'Valid Accounts' } },
    );
    const evasion = heatmap.columns.find((column) => column.tactic === 'Defense Evasion');
    expect(evasion?.cells[0]).toMatchObject({
      techniqueId: 'T1078',
      techniqueName: 'Valid Accounts',
    });
  });

  it('keeps empty API results as an empty projection, not invented ATT&CK cells', () => {
    const heatmap = buildMitreHeatmap([]);
    expect(heatmap.mappedTechniques).toBe(0);
    expect(heatmap.columns).toHaveLength(14);
    expect(heatmap.columns.every((column) => column.cells.length === 0)).toBe(true);
  });
});
