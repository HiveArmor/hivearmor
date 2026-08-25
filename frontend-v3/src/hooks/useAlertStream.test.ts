import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('useAlertStream (A1-SSE-01)', () => {
  it('connects to the hardened ha-alerts stream, not the ungated legacy path', () => {
    const source = readFileSync(resolve(__dirname, './useAlertStream.ts'), 'utf8');
    expect(source).toContain("/api/ha-alerts/stream");
    expect(source).not.toContain("/api/alerts/stream");
  });
});
