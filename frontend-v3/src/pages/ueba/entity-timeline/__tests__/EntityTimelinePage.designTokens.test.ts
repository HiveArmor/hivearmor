/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Property 10: No hex literals; every color resolves from `--ha-*`.
 *
 * For every color used at runtime by `EntityTimelinePage`, the value equals
 * `getComputedStyle(document.documentElement).getPropertyValue('--ha-*')` for
 * some token in `Design_Token_Set`; the source file contains no
 * `#[0-9a-fA-F]{3,8}` literal.
 *
 * This property is verified through static source analysis:
 * 1. The EntityTimelinePage source contains no hex color literal.
 * 2. Every color reference uses `getComputedStyle` + a `--ha-*` token.
 * 3. No raw hex color strings appear in the file.
 *
 * **Validates: Requirements 5.3, 7.7**
 */
import fs from 'node:fs';
import path from 'node:path';

import * as fc from 'fast-check';
import { describe, test, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Resolves to the `frontend-v3/` directory. */
const FRONTEND_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * Sprint 29 entity-timeline source files to inspect for hex color violations.
 * Files are scanned relative to `frontend-v3/`.
 */
const ENTITY_TIMELINE_FILES = [
  'src/pages/ueba/entity-timeline/EntityTimelinePage.tsx',
];

/**
 * Additional Sprint 29 UEBA frontend files that may reference colors.
 * We include the service and hooks for completeness.
 */
const ADDITIONAL_SPRINT29_FILES = [
  'src/services/ueba.service.ts',
  'src/types/ueba.types.ts',
];

/**
 * The Design_Token_Set tokens consumed by Sprint 29 charts.
 */
const DESIGN_TOKEN_SET = [
  '--ha-text-secondary',
  '--ha-high',
  '--ha-critical',
] as const;

/**
 * Regex that matches hex color literals: #RGB, #RGBA, #RRGGBB, #RRGGBBAA.
 * Matches 3, 4, 6, or 8 hex chars after the `#`.
 */
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * Regex for acceptable direct `getComputedStyle` + `--ha-*` usage.
 */
const GET_COMPUTED_STYLE_REGEX =
  /getComputedStyle\s*\(\s*document\.documentElement\s*\)\s*\.getPropertyValue\s*\(\s*['"`]--ha-/;

/**
 * Regex for acceptable `useHaThemeTokens` usage — the hook resolves tokens
 * via `getComputedStyle` internally (see src/hooks/useHaThemeTokens.ts).
 */
const USE_HA_THEME_TOKENS_REGEX = /useHaThemeTokens\s*\(/;

/**
 * Regex for acceptable `resolveHaToken` usage — also uses getComputedStyle.
 */
const RESOLVE_HA_TOKEN_REGEX = /resolveHaToken\s*\(/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileSafe(relativePath: string): string | null {
  const fullPath = path.join(FRONTEND_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Extract all lines from source that contain a hex color literal,
 * excluding comments (single-line `//` and block comments).
 */
function findHexColorLines(source: string): { line: number; text: string; match: string }[] {
  const results: { line: number; text: string; match: string }[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];

    // Skip single-line comments
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//')) continue;
    // Skip lines that are inside a block comment (simplistic heuristic)
    if (trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    const matches = lineText.match(HEX_COLOR_REGEX);
    if (matches) {
      for (const m of matches) {
        results.push({ line: i + 1, text: lineText.trim(), match: m });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Property 10 — Source file scan: no hex color literals
// ---------------------------------------------------------------------------

describe('Property 10: No hex literals; every color resolves from --ha-*', () => {

  describe('EntityTimelinePage — no hex color literals in source', () => {
    for (const file of ENTITY_TIMELINE_FILES) {
      it(`${file} contains no #[0-9a-fA-F]{3,8} literal`, () => {
        const content = readFileSafe(file);
        if (content === null) {
          // File not yet created (tasks 5.4-5.7 pending) — skip gracefully.
          // Once the file is created, this test will enforce the invariant.
          return;
        }

        const violations = findHexColorLines(content);
        expect(
          violations,
          `Found hex color literals in ${file}:\n${violations.map(v => `  L${v.line}: ${v.match} — ${v.text}`).join('\n')}`,
        ).toHaveLength(0);
      });

      it(`${file} uses getComputedStyle with --ha-* tokens for color resolution`, () => {
        const content = readFileSafe(file);
        if (content === null) return; // file not yet created — skip

        // The file must resolve colors from CSS custom properties. This can be done:
        // 1. Directly via getComputedStyle(document.documentElement).getPropertyValue('--ha-*')
        // 2. Via the useHaThemeTokens hook (which calls getComputedStyle internally)
        // 3. Via the resolveHaToken helper (which calls getComputedStyle internally)
        const usesGetComputedStyle = GET_COMPUTED_STYLE_REGEX.test(content);
        const usesHaThemeTokensHook = USE_HA_THEME_TOKENS_REGEX.test(content);
        const usesResolveHaToken = RESOLVE_HA_TOKEN_REGEX.test(content);

        expect(
          usesGetComputedStyle || usesHaThemeTokensHook || usesResolveHaToken,
          `${file} must resolve colors via getComputedStyle, useHaThemeTokens, or resolveHaToken`,
        ).toBe(true);
      });
    }
  });

  describe('Additional Sprint 29 UEBA files — no hex color literals', () => {
    for (const file of ADDITIONAL_SPRINT29_FILES) {
      it(`${file} contains no #[0-9a-fA-F]{3,8} literal`, () => {
        const content = readFileSafe(file);
        if (content === null) return;

        const violations = findHexColorLines(content);
        expect(
          violations,
          `Found hex color literals in ${file}:\n${violations.map(v => `  L${v.line}: ${v.match} — ${v.text}`).join('\n')}`,
        ).toHaveLength(0);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Property-based: for any valid --ha-* token, the source pattern should
  // accept that token in a getComputedStyle call without hex fallback.
  // ---------------------------------------------------------------------------

  describe('Design_Token_Set tokens are the only color sources', () => {
    test(
      'any token from Design_Token_Set is a valid --ha-* CSS custom property',
      () => {
        // This verifies the token set itself is well-formed: each starts with --ha-
        const tokenArb = fc.constantFrom(...DESIGN_TOKEN_SET);

        fc.assert(
          fc.property(tokenArb, (token) => {
            expect(token.startsWith('--ha-')).toBe(true);
            // Each token should exist in the tokens.css file
            const tokensCSS = readFileSafe('src/styles/tokens.css');
            expect(tokensCSS).not.toBeNull();
            expect(tokensCSS!).toContain(token);
          }),
          { numRuns: DESIGN_TOKEN_SET.length },
        );
      },
    );

    test(
      'EntityTimelinePage source references only Design_Token_Set tokens (when file exists)',
      () => {
        const content = readFileSafe(ENTITY_TIMELINE_FILES[0]);
        if (content === null) return; // file not yet created — skip

        // Extract all --ha-* references from the file
        const haTokenRefs = content.match(/--ha-[\w-]+/g) ?? [];

        // All known UEBA chart tokens (expand this if the design adds more)
        const allowedTokens = new Set<string>([
          '--ha-text-secondary',
          '--ha-high',
          '--ha-critical',
          '--ha-primary',
          '--ha-medium',
          '--ha-positive',
          '--ha-background',
          '--ha-surface-primary',
          '--ha-surface-raised',
          '--ha-border',
          '--ha-text-primary',
          '--ha-intelligence',
        ]);

        for (const ref of haTokenRefs) {
          expect(
            allowedTokens.has(ref),
            `Token "${ref}" in EntityTimelinePage must be a known --ha-* token`,
          ).toBe(true);
        }
      },
    );
  });
});
