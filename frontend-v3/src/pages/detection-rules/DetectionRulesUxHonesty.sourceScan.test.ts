import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DETECTION_RULES_JOB_SENTENCE } from './DetectionRulesPage';

describe('detection rules UX honesty (Prompt 16)', () => {
  const page = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.tsx'), 'utf8');
  const styles = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.css'), 'utf8');
  const columns = readFileSync(join(process.cwd(), 'src/pages/detection-rules/columnDefs.tsx'), 'utf8');

  it('states inventory-first job sentence distinct from alert triage', () => {
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/detection content|rule inventory/i);
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/MITRE|coverage|test/i);
    expect(DETECTION_RULES_JOB_SENTENCE).toMatch(/Alert triage lives on Analyst Queue/i);
    expect(page).toContain('DETECTION_RULES_JOB_SENTENCE');
  });

  it('wires staging honesty, meta links, and human role labels', () => {
    expect(page).toContain('STAGING CANDIDATE');
    expect(page).toContain('detection-empty-honesty');
    expect(page).toContain('Mission Control');
    expect(page).toContain('ROUTES.ALERTS');
    expect(page).toContain('ROUTES.CORRELATED_FINDINGS');
    expect(page).toContain('ROUTES.RESPONSE_PLAYBOOKS');
    expect(page).toContain('ROUTES.UEBA_RISK');
    expect(page).toContain("setView('ueba')");
    expect(page).toContain('DetectionUebaPanel');
    expect(page).toContain('Platform Administrator');
    expect(page).not.toContain('detection-kpis');
  });

  it('gates create, test, and activate behind canManage with human labels', () => {
    expect(page).toContain('canManage');
    expect(page).toContain('DETECTION_MANAGE_DENIED_TITLE');
    expect(columns).toContain('MANAGE_DENIED_TITLE');
    expect(columns).toContain('Platform Administrator');
  });

  it('keeps rule grid primary with compact filters and no fake health KPI strip', () => {
    expect(styles).toContain('min-height: 50vh');
    expect(styles).toContain('.detection-inventory');
    expect(styles).not.toContain('.detection-kpis');
  });

  it('wires match-but-suppressed dry-run outcome copy', () => {
    const consoleSource = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionTestConsole.tsx'), 'utf8');
    expect(consoleSource).toContain('Matched — suppressed by exception');
    expect(consoleSource).toContain('STAGING CANDIDATE');
    expect(consoleSource).toContain('exceptionsApplied');
  });

  it('wires ATT&CK coverage to canonical /mitre APIs instead of inventory-only grouping', () => {
    const coverage = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionCoverageView.tsx'), 'utf8');
    const service = readFileSync(join(process.cwd(), 'src/services/mitre.service.ts'), 'utf8');
    expect(service).toContain('/mitre/coverage');
    expect(service).toContain('/mitre/rules');
    expect(coverage).toContain('mitreService.getCoverage');
    expect(coverage).toContain('mitreService.getRulesByTechnique');
    expect(coverage).toContain('detection-mitre-api-unused');
    expect(coverage).toContain('not proof of full ATT&amp;CK coverage');
    expect(coverage).not.toContain('fetchCoverage');
    expect(coverage).not.toContain('/ha-detection-rules/coverage');
  });

  it('surfaces sequence/risk/graph enterprise pack inventory', () => {
    expect(page).toContain('detection-enterprise-pack-honesty');
    expect(page).toContain('afterEvents');
    expect(page).toContain('addScoreFn');
    expect(page).toContain('NEO4J_ENABLED=true');
    expect(page).toContain('flag was never flipped');
    expect(page).toContain('ENGINE_OPTIONS');
    expect(page).toContain('engineFilter');
    expect(columns).toContain('EngineCell');
    const fixtures = readFileSync(join(process.cwd(), 'src/pages/detection-rules/detectionRules.fixtures.ts'), 'utf8');
    expect(fixtures).toContain('afterEvents lookback');
    expect(fixtures).not.toContain('Staging may be idle if Neo4j is off');
    expect(fixtures).toContain("engine: 'sequence'");
    expect(fixtures).toContain("engine: 'risk'");
    expect(fixtures).toContain("engine: 'graph'");
    expect(fixtures).toContain('SEQ-BRUTE-FORCE-THEN-SUCCESS');
    expect(fixtures).toContain('ENTERPRISE_PACK_RULE_IDS');
    for (const id of [9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 9110, 9111, 9112, 9113, 9114, 9115, 9116, 9117, 9118]) {
      expect(fixtures).toContain(`id: ${id}`);
    }
    expect(fixtures).toContain('SEQ-PHISH-THEN-MACRO-EXEC');
    expect(fixtures).toContain('RISK-LSASS-MEMORY-ACCESS');
    expect(fixtures).toContain('GRAPH-PASSWORD-SPRAY-MULTI-ACCOUNT');
    expect(fixtures).toContain('v3-hive-log-*');
    expect(fixtures).not.toContain('v11-log-*');
  });

  it('surfaces skill content pack inventory with Neo4j honesty', () => {
    expect(page).toContain('detection-skill-pack-honesty');
    expect(page).toContain('skill content pack (16 rules: 6 CEL, 5 sequence, 3 risk, 2 graph)');
    expect(page).toContain('v3-hive-log-*');
    expect(page).not.toContain('v11-log-*');
    const fixtures = readFileSync(join(process.cwd(), 'src/pages/detection-rules/detectionRules.fixtures.ts'), 'utf8');
    expect(fixtures).toContain('SKILL_PACK_RULE_IDS');
    expect(fixtures).toContain("engine: 'cel'");
    expect(fixtures).toContain('CEL-WIN-SHADOW-CREDENTIALS');
    expect(fixtures).toContain('SEQ-KERBEROAST-THEN-LATERAL');
    expect(fixtures).toContain('RISK-ASREPROAST');
    expect(fixtures).toContain('GRAPH-JUMP-HOST-MULTI-ACCOUNT');
    expect(fixtures).toContain('GRAPH-STOLEN-CREDS-PIVOT-C2');
    for (const id of [9401, 9402, 9403, 9404, 9405, 9406, 9407, 9408, 9409, 9410, 9411, 9412, 9413, 9414, 9415, 9416]) {
      expect(fixtures).toContain(`id: ${id}`);
    }
    expect(fixtures).toContain('v3-hive-log-*');
    expect(fixtures).not.toContain('v11-log-*');
  });

  it('isolates MSSP tenant detection packs with two-tenant fixtures', () => {
    expect(page).toContain('detection-mssp-pack-honesty');
    expect(page).toContain('Detection pack tenant');
    expect(page).toContain('DETECTION_PACK_HONESTY');
    const fixtures = readFileSync(join(process.cwd(), 'src/pages/detection-rules/detectionRules.fixtures.ts'), 'utf8');
    expect(fixtures).toContain('ACME-CUSTOM-VPN-GEO-ANOMALY');
    expect(fixtures).toContain('CWM-CUSTOM-OT-PROTOCOL-ANOMALY');
    expect(fixtures).toContain('REST-visible, not engine-enforced until $WORK_DIR/tenants/');
    expect(fixtures).not.toContain('v11-log-*');
    const packService = readFileSync(join(process.cwd(), 'src/services/detectionPack.service.ts'), 'utf8');
    expect(packService).toContain('tenant packs are REST-visible');
    expect(packService).toContain('not engine-enforced until then');
    expect(packService).toContain('v3-hive-<type>-YYYY.MM.DD');
  });
});
