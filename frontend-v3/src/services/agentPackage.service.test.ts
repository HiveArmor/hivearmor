import { describe, expect, it } from 'vitest';

import { isAgentVersionBehind } from './agentPackage.service';

describe('isAgentVersionBehind', () => {
  it('returns false when either side is missing', () => {
    expect(isAgentVersionBehind(null, '11.0.0')).toBe(false);
    expect(isAgentVersionBehind('11.0.0', null)).toBe(false);
  });

  it('returns true when versions differ', () => {
    expect(isAgentVersionBehind('11.0.0-staging', '11.0.1-staging')).toBe(true);
  });

  it('returns false when versions match', () => {
    expect(isAgentVersionBehind('11.0.0-staging', '11.0.0-staging')).toBe(false);
  });
});
