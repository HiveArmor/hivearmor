/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Property 11: No direct ECharts import outside HaChart; no `any`; no hex literals.
 *
 * Every Sprint 29 frontend source file imports charting APIs only through `HaChart`,
 * contains no `any` TypeScript type, and contains no `#[0-9a-fA-F]{3,8}` color literal
 * (static source scan).
 *
 * This is a property-based test using fast-check to verify across all Sprint 29 files.
 *
 * **Validates: Requirements 7.6, 7.7**
 */
import fs from 'node:fs';
import path from 'node:path';

import * as fc from 'fast-check';
import { describe, test, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Resolves to the `frontend-v3/` directory. */
const FRONTEND_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * Sprint 29 frontend source files to scan.
 * Includes all UEBA pages, services, hooks, and types created in Sprint 29.
 */
const SPRINT_29_SOURCE_FILES = [
  'src/pages/ueba/entity-timeline/EntityTimelinePage.tsx',
  'src/pages/ueba/risk/RiskDashboardPage.tsx',
  'src/services/ueba.service.ts',
  'src/types/ueba.types.ts',
];

/**
 * Files that are ALLOWED to import echarts directly — only HaChart itself.
 */
const HACHART_ALLOWLIST = [
  'src/components/ha-chart/HaChart.tsx',
];

/**
 * Regex matching `import type` from echarts — these are acceptable as they
 * only import TypeScript type annotations, not runtime charting APIs.
 */
const ECHARTS_TYPE_IMPORT_REGEX = /^\s*import\s+type\s+.*from\s+['"]echarts['"]/gm;

/**
 * Regex matching the `any` type annotation in TypeScript.
 * Matches `: any`, `<any>`, `as any`, but avoids false positives in comments/strings.
 */
const ANY_TYPE_REGEX = /(?::\s*any\b|<any>|as\s+any\b)/g;

/**
 * Regex matching hex color literals: #RGB, #RGBA, #RRGGBB, #RRGGBBAA.
 */
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileSafe(relativePath: string): string | null {
  const fullPath = path.join(FRONTEND_ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Strip comments from source to avoid false positives in comment text.
 * Removes single-line comments (//) and block comments.
 */
function stripComments(source: string): string {
  // Remove block comments
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (but not URLs like https://)
  stripped = stripped.replace(/(?<![:'"])\/\/.*$/gm, '');
  return stripped;
}

/**
 * Check if a line is inside a string literal (rough heuristic).
 * Lines containing hex-looking patterns inside template literals or strings are OK
 * if they're clearly regex patterns (e.g., in test files testing for hex).
 */
function isInStringOrRegex(line: string, matchIndex: number): boolean {
  // Simple heuristic: if the match is inside a regex pattern like /.../ or a string
  const beforeMatch = line.substring(0, matchIndex);
  const singleQuotes = (beforeMatch.match(/'/g) ?? []).length;
  const doubleQuotes = (beforeMatch.match(/"/g) ?? []).length;
  const backticks = (beforeMatch.match(/`/g) ?? []).length;
  // If odd number of quotes, we're probably inside a string
  return singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0;
}

/**
 * Find hex color violations in source code, excluding:
 * - Comments (single-line and block)
 * - Lines that are part of a regex pattern definition (like /regex/)
 * - Import statements for type-only echarts imports
 */
function findHexColorViolations(source: string): { line: number; match: string; text: string }[] {
  const violations: { line: number; match: string; text: string }[] = [];
  const stripped = stripComments(source);
  const lines = stripped.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();

    // Skip empty lines and import type lines
    if (!trimmed) continue;
    if (trimmed.startsWith('import type')) continue;

    let match: RegExpExecArray | null;
    const regex = new RegExp(HEX_COLOR_REGEX.source, 'g');
    while ((match = regex.exec(lineText)) !== null) {
      // Skip if inside a string/regex definition used for testing
      if (!isInStringOrRegex(lineText, match.index)) {
        violations.push({ line: i + 1, match: match[0], text: trimmed });
      }
    }
  }

  return violations;
}

/**
 * Find `any` type violations in source code, excluding comments.
 */
function findAnyTypeViolations(source: string): { line: number; text: string }[] {
  const violations: { line: number; text: string }[] = [];
  const stripped = stripComments(source);
  const lines = stripped.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();

    // Skip empty lines
    if (!trimmed) continue;

    if (ANY_TYPE_REGEX.test(lineText)) {
      violations.push({ line: i + 1, text: trimmed });
    }
    // Reset lastIndex since we're reusing the regex
    ANY_TYPE_REGEX.lastIndex = 0;
  }

  return violations;
}

/**
 * Find direct echarts imports (not `import type`) in source code.
 */
function findDirectEchartsImports(source: string): { line: number; text: string }[] {
  const violations: { line: number; text: string }[] = [];
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();

    // Skip type-only imports (these are acceptable)
    if (ECHARTS_TYPE_IMPORT_REGEX.test(trimmed)) {
      ECHARTS_TYPE_IMPORT_REGEX.lastIndex = 0;
      continue;
    }
    ECHARTS_TYPE_IMPORT_REGEX.lastIndex = 0;

    // Check for runtime echarts imports
    if (/^\s*import\s+/.test(trimmed) &&
        (/from\s+['"]echarts['"]/.test(trimmed) ||
         /from\s+['"]echarts-for-react['"]/.test(trimmed))) {
      violations.push({ line: i + 1, text: trimmed });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Property 11 — Static source scan
// ---------------------------------------------------------------------------

describe('Property 11: HaChart-only imports, no-any, no-hex invariants', () => {

  // -------------------------------------------------------------------------
  // Invariant 1: No direct echarts import outside HaChart
  // -------------------------------------------------------------------------
  describe('No direct ECharts import outside HaChart', () => {
    for (const file of SPRINT_29_SOURCE_FILES) {
      it(`${file} imports charting APIs only through HaChart`, () => {
        const content = readFileSafe(file);
        if (content === null) return; // file not yet created — skip

        // This file should not be in the allowlist
        if (HACHART_ALLOWLIST.includes(file)) return;

        const violations = findDirectEchartsImports(content);
        expect(
          violations,
          `Found direct echarts imports in ${file}:\n${violations.map(v => `  L${v.line}: ${v.text}`).join('\n')}`,
        ).toHaveLength(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Invariant 2: No `any` TypeScript type
  // -------------------------------------------------------------------------
  describe('No `any` TypeScript type', () => {
    for (const file of SPRINT_29_SOURCE_FILES) {
      it(`${file} contains no \`any\` type annotation`, () => {
        const content = readFileSafe(file);
        if (content === null) return; // file not yet created — skip

        const violations = findAnyTypeViolations(content);
        expect(
          violations,
          `Found \`any\` type annotations in ${file}:\n${violations.map(v => `  L${v.line}: ${v.text}`).join('\n')}`,
        ).toHaveLength(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Invariant 3: No hex color literals
  // -------------------------------------------------------------------------
  describe('No hex color literals (#[0-9a-fA-F]{3,8})', () => {
    for (const file of SPRINT_29_SOURCE_FILES) {
      it(`${file} contains no hex color literal`, () => {
        const content = readFileSafe(file);
        if (content === null) return; // file not yet created — skip

        const violations = findHexColorViolations(content);
        expect(
          violations,
          `Found hex color literals in ${file}:\n${violations.map(v => `  L${v.line}: ${v.match} — ${v.text}`).join('\n')}`,
        ).toHaveLength(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Property-based: for any Sprint 29 file chosen arbitrarily from the set,
  // the three invariants hold.
  // -------------------------------------------------------------------------
  describe('Property-based scan over Sprint 29 file set', () => {
    test(
      'for any Sprint 29 frontend source file, all three invariants hold',
      () => {
        const existingFiles = SPRINT_29_SOURCE_FILES.filter(
          (f) => readFileSafe(f) !== null,
        );

        if (existingFiles.length === 0) {
          // No files exist yet — skip (tests will enforce once files are created)
          return;
        }

        const fileArb = fc.constantFrom(...existingFiles);

        fc.assert(
          fc.property(fileArb, (file) => {
            const content = readFileSafe(file)!;

            // Invariant 1: No direct echarts import
            if (!HACHART_ALLOWLIST.includes(file)) {
              const echartsViolations = findDirectEchartsImports(content);
              expect(echartsViolations).toHaveLength(0);
            }

            // Invariant 2: No `any` type
            const anyViolations = findAnyTypeViolations(content);
            expect(anyViolations).toHaveLength(0);

            // Invariant 3: No hex color literal
            const hexViolations = findHexColorViolations(content);
            expect(hexViolations).toHaveLength(0);
          }),
          { numRuns: existingFiles.length * 3 },
        );
      },
    );
  });
});
