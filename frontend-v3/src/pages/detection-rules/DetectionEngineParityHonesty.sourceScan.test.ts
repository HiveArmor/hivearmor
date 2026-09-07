import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('DET-TEST-002 / DET-SIGMA-001b honesty', () => {
  const consoleSource = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionTestConsole.tsx'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionRulesPage.tsx'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/pages/detection-rules/detectionRules.service.ts'), 'utf8');
  const importPanel = readFileSync(join(process.cwd(), 'src/pages/detection-rules/DetectionImportPanel.tsx'), 'utf8');
  const fixtures = readFileSync(join(process.cwd(), 'src/pages/detection-rules/detectionRules.fixtures.ts'), 'utf8');

  it('test console reports engineParity go vs unavailable and never claims Java CEL runs sequence', () => {
    expect(consoleSource).toContain('detection-parity-honesty');
    expect(consoleSource).toContain('detection-engine-parity');
    expect(consoleSource).toContain('engineParity=go');
    expect(consoleSource).toContain('engineParity=unavailable');
    expect(consoleSource).toContain('never fakes sequence/risk/graph hits');
    expect(consoleSource).not.toMatch(/This console does not execute the sequence, risk, or graph engines/);
  });

  it('sandbox fixture never promotes a sequence step CEL match to a hit', () => {
    expect(service).toContain("engineParity: 'go'");
    expect(service).toContain("engineParity: 'unavailable'");
    expect(service).toContain('sequenceComplete: false');
    expect(service).toContain('A step match is not a sequence hit');
    expect(service).toContain('activateSigmaRule');
    expect(service).toContain('engineLoaded=false because LoadReport.loadedNames does not list this rule');
    expect(service).toContain('watchLoop may take up to ~30s');
    expect(fixtures).toContain('sample-sequence-fail-001');
  });

  it('inventory and import keep LoadReport vs reload HTTP honesty', () => {
    expect(page).toContain('engineParity=go');
    expect(page).toContain('engineLoaded=true');
    expect(page).toContain('LoadReport lists the rule');
    expect(page).toContain('watchLoop');
    expect(importPanel).toContain('engineLoaded=true only when LoadReport lists the rule');
    expect(importPanel).toContain('reload HTTP 200/202 is not enough');
    expect(importPanel).toContain('activateSigmaRule');
  });
});
