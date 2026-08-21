import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { productionViteEnv } from './vite-env.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));

describe('productionViteEnv', () => {
  it('keeps foundation fixtures off unless explicitly true', () => {
    const env = productionViteEnv({ VITE_USE_FOUNDATION_FIXTURES: 'false' });
    expect(env.DEV).toBe(false);
    expect(env.PROD).toBe(true);
    expect(env.VITE_USE_FOUNDATION_FIXTURES).toBe('false');
    expect(env.VITE_FEATURE_SITREP_ENABLED).toBe('false');
  });

  it('passes through opted-in feature flags', () => {
    const env = productionViteEnv({
      VITE_FEATURE_SITREP_ENABLED: 'true',
      VITE_BACKEND_URL: '',
    });
    expect(env.VITE_FEATURE_SITREP_ENABLED).toBe('true');
    expect(env.VITE_FEATURE_AAR_ENABLED).toBe('false');
  });
});

describe('esbuild production CSS', () => {
  it('does not drop component styles with an empty CSS loader', () => {
    const buildScript = readFileSync(join(scriptsDir, 'build.mjs'), 'utf8');
    expect(buildScript).not.toContain('--loader:.css=empty');
    expect(buildScript).toContain('--loader:.woff2=file');
  });
});
