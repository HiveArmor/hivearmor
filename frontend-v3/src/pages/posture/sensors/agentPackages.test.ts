import { describe, expect, it } from 'vitest';

import { AGENT_PACKAGES } from './agentPackages';

describe('AGENT_PACKAGES', () => {
  it('exposes same-origin download paths for each supported binary', () => {
    expect(AGENT_PACKAGES.length).toBe(6);
    for (const pkg of AGENT_PACKAGES) {
      expect(pkg.href).toBe(`/agent-packages/${pkg.filename}`);
      expect(pkg.filename.startsWith('hivearmor_agent_service_')).toBe(true);
    }
  });
});
