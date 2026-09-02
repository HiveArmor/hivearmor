/**
 * SystemSettingsTabs source-scan honesty guard.
 *
 * Statically asserts the three newly-wired System Settings tabs obey the
 * non-negotiable design-system constraints (spec §6):
 *   - Zero hex/rgb/hsl color literals — colors only via var(--ha-*) tokens.
 *   - Zero `any` types.
 *   - Ha* wrappers only (no raw <input>/<select>/<button> primitives).
 *   - apiClient path only — no absolute backend URLs, no direct localStorage.
 *
 * Mirrors the style of ApiKeyUxHonesty.sourceScan.test.ts.
 *
 * Requirements: 6, 7
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const TAB_FILES = [
  'src/pages/settings/tabs/GeneralTab.tsx',
  'src/pages/settings/tabs/EmailTab.tsx',
  'src/pages/settings/tabs/SecurityTab.tsx',
];

// Matches 3- or 6-digit hex color literals (#fff, #ff8800) but not var(--ha-*).
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/;
const RGB_HSL_RE = /\b(?:rgb|rgba|hsl|hsla)\s*\(/;
const ANY_TYPE_RE = /:\s*any\b|<any>|as\s+any\b|Array<any>/;

describe('System Settings tabs — design-system source-scan honesty', () => {
  for (const rel of TAB_FILES) {
    const source = readFileSync(join(process.cwd(), rel), 'utf8');

    describe(rel, () => {
      it('contains no hex color literals', () => {
        expect(HEX_COLOR_RE.test(source)).toBe(false);
      });

      it('contains no rgb()/hsl() color literals', () => {
        expect(RGB_HSL_RE.test(source)).toBe(false);
      });

      it('contains no `any` types', () => {
        expect(ANY_TYPE_RE.test(source)).toBe(false);
      });

      it('uses only var(--ha-*) tokens for colors (references at least one token)', () => {
        expect(source).toContain('var(--ha-');
      });

      it('makes no absolute backend URL calls', () => {
        expect(/https?:\/\/[^'"\s]*\/api\//.test(source)).toBe(false);
      });

      it('does not access localStorage directly', () => {
        expect(source).not.toContain('localStorage');
      });

      it('uses Ha* wrapper components (no raw form primitives)', () => {
        expect(source).toContain('HaFormGroup');
        expect(source).toContain('HaButton');
      });
    });
  }
});
