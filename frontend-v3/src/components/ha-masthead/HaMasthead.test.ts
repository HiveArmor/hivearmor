import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('compact operational shell', () => {
  it('keeps account access out of the masthead and uses the shared compact shell tokens', async () => {
    const mastheadSource = await import('./HaMasthead.tsx?raw');
    const foundationSource = readFileSync(join(__dirname, '../../styles/foundation.css'), 'utf8');
    const globalSource = readFileSync(join(__dirname, '../../styles/global.css'), 'utf8');

    expect(mastheadSource.default).not.toContain('UserAvatarMenu');
    expect(foundationSource).toContain('--ha-masthead-height: 50px');
    expect(foundationSource).toContain('--ha-page-header-height: 58px');
    expect(foundationSource).toContain('--ha-scrollbar-size: 4px');
    expect(globalSource).toContain('width: var(--ha-scrollbar-size)');
  });
});
