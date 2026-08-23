#!/usr/bin/env node
/**
 * HiveArmor frontend-v3 build script.
 * Uses esbuild directly — Vite 8 requires rolldown native bindings (ARM64/linux)
 * that are not present in this environment.
 *
 * DO NOT modify the esbuild resolution logic below. It is intentionally
 * platform-aware: macOS uses node_modules/.bin/esbuild (Mach-O ARM64),
 * Linux sandbox uses the tsx-bundled ELF ARM64 binary. Both are verified
 * at runtime — the first one that executes successfully is used.
 *
 * Replace with `vite build` once rolldown ARM64 bindings are available.
 * In CI/CD and production environments, `vite build` is the canonical command.
 */

import { execSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { productionViteEnv } from './vite-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const DIST_ASSETS = join(DIST, 'assets');

// ── Resolve esbuild binary (platform-aware) ───────────────────────────────────
// macOS ARM64 (Claude Code CLI on Mac): node_modules/.bin/esbuild is Mach-O ARM64
// Linux ARM64 (Claude Desktop VM sandbox): tsx-bundled ELF ARM64 binary
const CANDIDATE_PATHS = [
  join(ROOT, 'node_modules/.bin/esbuild'),
  '/usr/local/lib/node_modules_global/lib/node_modules/tsx/node_modules/esbuild/bin/esbuild',
];

function resolveEsbuild() {
  for (const p of CANDIDATE_PATHS) {
    if (!existsSync(p)) continue;
    try {
      execSync(`"${p}" --version`, { stdio: 'pipe' });
      return p;
    } catch {
      // Wrong platform binary — try next
    }
  }
  throw new Error(
    'No working esbuild binary found.\n' +
    'Tried:\n' + CANDIDATE_PATHS.map(p => `  ${p}`).join('\n')
  );
}

const ESBUILD = resolveEsbuild();

// ── Clean dist ────────────────────────────────────────────────────────────────
try {
  execSync(`rm -rf "${DIST}"`, { stdio: 'pipe' });
} catch {
  // ignore — may not exist
}
mkdirSync(DIST_ASSETS, { recursive: true });

// ── Bundle JS ─────────────────────────────────────────────────────────────────
console.log('Building JS bundle…');
const jsBuild = spawnSync(ESBUILD, [
  join(ROOT, 'src/main.tsx'),
  '--bundle',
  '--format=esm',
  `--outdir=${DIST_ASSETS}`,
  '--entry-names=index',
  '--chunk-names=chunks/[name]-[hash]',
  '--asset-names=assets/[name]-[hash]',
  '--jsx=automatic',
  '--jsx-import-source=react',
  '--platform=browser',
  '--target=es2020',
  `--define:import.meta.env=${JSON.stringify(productionViteEnv())}`,
  '--alias:@/pages/command-center/commandCenter.fixtures=./src/pages/command-center/commandCenter.fixture-disabled.ts',
  '--alias:@/pages/entities/entities.fixtures=./src/pages/entities/entities.fixture-disabled.ts',
  '--alias:@/pages/investigations/investigation.fixtures=./src/pages/investigations/investigation.fixture-disabled.ts',
  '--alias:@/pages/incidents/incidents.fixtures=./src/pages/incidents/incidents.fixture-disabled.ts',
  '--alias:@/pages/incidents/incidentDetail.fixtures=./src/pages/incidents/incidentDetail.fixture-disabled.ts',
  '--alias:@/pages/incidents/incidentWorkbench.fixtures=./src/pages/incidents/incidentWorkbench.fixture-disabled.ts',
  '--alias:@/pages/alerts/alertTriage.fixtures=./src/pages/alerts/alertTriage.fixture-disabled.ts',
  '--alias:@/pages/alerts/alertInvestigation.fixtures=./src/pages/alerts/alertInvestigation.fixture-disabled.ts',
  '--alias:@/pages/search-hunt/searchHunt.fixtures=./src/pages/search-hunt/searchHunt.fixture-disabled.ts',
  '--alias:@/pages/constellation/constellation.fixtures=./src/pages/constellation/constellation.fixture-disabled.ts',
  '--alias:@/pages/detection-rules/detectionRules.fixtures=./src/pages/detection-rules/detectionRules.fixture-disabled.ts',
  '--alias:@/pages/response/playbookBuilder.fixtures=./src/pages/response/playbookBuilder.fixture-disabled.ts',
  '--alias:@/services/responseActionService.fixtures=./src/services/responseActionService.fixture-disabled.ts',
  '--alias:@/services/playbookService.fixtures=./src/services/playbookService.fixture-disabled.ts',
  '--alias:@/pages/response/response.fixtures=./src/pages/response/response.fixture-disabled.ts',
  '--alias:@/pages/edr/fileQuarantine.fixtures=./src/pages/edr/fileQuarantine.fixture-disabled.ts',
  '--alias:@/pages/posture/assets/assets.fixtures=./src/pages/posture/assets/assets.fixture-disabled.ts',
  '--alias:@/pages/posture/active-directory/active-directory.fixtures=./src/pages/posture/active-directory/active-directory.fixture-disabled.ts',
  '--alias:@/pages/posture/exposure/exposure.fixtures=./src/pages/posture/exposure/exposure.fixture-disabled.ts',
  '--splitting=true',
  '--minify',
  '--sourcemap',
  '--loader:.svg=dataurl',
  '--loader:.woff2=file',
  '--loader:.woff=file',
  '--loader:.ttf=file',
  '--loader:.otf=file',
  '--loader:.eot=file',
  '--loader:.png=file',
  '--loader:.jpg=file',
  '--loader:.gif=file',
  '--log-level=warning',
  '--color=true',
], { cwd: ROOT, stdio: 'inherit' });
if (jsBuild.status !== 0) {
  process.exit(jsBuild.status ?? 1);
}

if (!existsSync(join(DIST_ASSETS, 'index.css'))) {
  console.error('esbuild did not emit dist/assets/index.css from JS CSS imports');
  process.exit(1);
}

// ── Copy public assets ────────────────────────────────────────────────────────
try {
  cpSync(join(ROOT, 'public'), DIST, { recursive: true });
} catch {
  // public may be empty
}

// ── Emit index.html ───────────────────────────────────────────────────────────
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8')
  .replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '<link rel="stylesheet" href="/assets/index.css">\n    <script type="module" src="/assets/index.js"></script>'
  );
writeFileSync(join(DIST, 'index.html'), html);

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n✓ Build complete → dist/');
const jsSize = Math.round(readFileSync(join(DIST_ASSETS, 'index.js')).length / 1024);
const cssSize = Math.round(readFileSync(join(DIST_ASSETS, 'index.css')).length / 1024);
const chunkDir = join(DIST_ASSETS, 'chunks');
const chunks = existsSync(chunkDir)
  ? readdirSync(chunkDir).filter((name) => name.endsWith('.js'))
  : [];
console.log(`  dist/assets/index.js  ${jsSize}kb`);
console.log(`  dist/assets/chunks/   ${chunks.length} lazy chunks`);
console.log(`  dist/assets/index.css ${cssSize}kb`);
console.log(`  dist/index.html`);
