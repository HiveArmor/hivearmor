/**
 * Production `import.meta.env` object injected by esbuild (scripts/build.mjs).
 * Individual `--define:import.meta.env.DEV=false` flags leave `import.meta.env`
 * itself undefined, so `import.meta.env.VITE_*` throws at runtime.
 */
export function productionViteEnv(env = process.env) {
  const flag = (name) => (env[name] === 'true' ? 'true' : 'false');
  return {
    DEV: false,
    PROD: true,
    MODE: 'production',
    BASE_URL: '/',
    SSR: false,
    VITE_USE_FOUNDATION_FIXTURES: flag('VITE_USE_FOUNDATION_FIXTURES'),
    VITE_FEATURE_SITREP_ENABLED: flag('VITE_FEATURE_SITREP_ENABLED'),
    VITE_FEATURE_INCIDENT_REPORTS_ENABLED: flag('VITE_FEATURE_INCIDENT_REPORTS_ENABLED'),
    VITE_FEATURE_AAR_ENABLED: flag('VITE_FEATURE_AAR_ENABLED'),
    VITE_BACKEND_URL: env.VITE_BACKEND_URL ?? '',
  };
}
