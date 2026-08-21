/**
 * S01 skeleton smoke test — validates project structure without DOM rendering.
 * Full component tests using React Testing Library are introduced in S05+.
 * Uses Node.js built-in test runner (node:test) — zero native dependencies.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');

describe('HiveArmor frontend-v3 scaffold', () => {
  describe('Required files exist', () => {
    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.ts',
      'index.html',
      'src/main.tsx',
      'src/App.tsx',
      'src/styles/tokens.css',
      'src/styles/global.css',
      'src/constants/routes.constants.ts',
      'src/constants/severity.constants.ts',
      'src/constants/status.constants.ts',
      'src/constants/api.constants.ts',
      'src/types/api.types.ts',
    ];

    for (const file of requiredFiles) {
      it(`${file} exists`, () => {
        assert.ok(existsSync(join(ROOT, file)), `Missing: ${file}`);
      });
    }
  });

  describe('Design tokens', () => {
    it('tokens.css contains all 12 immutable design tokens', () => {
      const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf-8');
      const requiredTokens = [
        '--ha-background',
        '--ha-surface-primary',
        '--ha-surface-raised',
        '--ha-border',
        '--ha-primary',
        '--ha-intelligence',
        '--ha-critical',
        '--ha-high',
        '--ha-medium',
        '--ha-positive',
        '--ha-text-primary',
        '--ha-text-secondary',
      ];
      for (const token of requiredTokens) {
        assert.ok(css.includes(token), `Design token missing: ${token}`);
      }
    });

    it('tokens.css contains correct value for --ha-primary', () => {
      const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf-8');
      assert.ok(css.includes('#32D6C5'), '--ha-primary must be #32D6C5 (immutable)');
    });

    it('tokens.css contains correct value for --ha-background', () => {
      const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf-8');
      assert.ok(css.includes('#070A0F'), '--ha-background must be #070A0F (immutable)');
    });
  });

  describe('package.json', () => {
    it('has type-check script', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(pkg.scripts['type-check'], 'package.json must have a "type-check" script');
      assert.ok(
        pkg.scripts['type-check'].includes('tsc --noEmit'),
        '"type-check" must map to "tsc --noEmit"'
      );
    });

    it('has lint script', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(pkg.scripts['lint'], 'package.json must have a "lint" script');
    });

    it('has test script', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(pkg.scripts['test'], 'package.json must have a "test" script');
    });

    it('has build script', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      assert.ok(pkg.scripts['build'], 'package.json must have a "build" script');
    });

    it('react version is 18.3.1', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
      assert.equal(pkg.dependencies['react'], '18.3.1', 'React must be pinned to 18.3.1');
    });
  });

  describe('Required src directories exist', () => {
    const requiredDirs = [
      'src/components',
      'src/constants',
      'src/hooks',
      'src/lib',
      'src/pages',
      'src/router',
      'src/services',
      'src/store',
      'src/styles',
      'src/types',
    ];
    for (const dir of requiredDirs) {
      it(`${dir}/ exists`, () => {
        assert.ok(existsSync(join(ROOT, dir)), `Missing directory: ${dir}`);
      });
    }
  });
});
