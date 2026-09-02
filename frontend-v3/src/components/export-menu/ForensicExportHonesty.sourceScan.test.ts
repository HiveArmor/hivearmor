/**
 * B0-4 — forensic export honesty source scan.
 *
 * The new export files (service, types, and the HaExportMenu control + CSS) must contain no hex
 * color literal and no `any` type — the design-system + type gates the spec enforces (§7, §9).
 * Static scan; comments are stripped so doc-comment prose does not trip the check.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const FRONTEND_ROOT = process.cwd();

const EXPORT_SOURCE_FILES = [
  'src/pages/search-hunt/forensicExport.service.ts',
  'src/pages/search-hunt/forensicExport.types.ts',
  'src/components/export-menu/HaExportMenu.tsx',
];

const CSS_FILES = ['src/components/export-menu/HaExportMenu.css'];

const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/;
const ANY_TYPE_REGEX = /(?::\s*any\b|<any>|as\s+any\b)/;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8');
}

/** Remove block + single-line comments (keeping `://` in URLs) to avoid prose false positives. */
function stripComments(source: string): string {
  let stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  stripped = stripped.replace(/(?<![:'"])\/\/.*$/gm, '');
  return stripped;
}

describe('forensic export honesty source scan', () => {
  for (const file of EXPORT_SOURCE_FILES) {
    it(`${file} contains no \`any\` type annotation`, () => {
      const violations = stripComments(read(file))
        .split('\n')
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter((entry) => entry.text && ANY_TYPE_REGEX.test(entry.text));
      expect(
        violations,
        `Found \`any\` in ${file}:\n${violations.map((v) => `  L${v.line}: ${v.text}`).join('\n')}`,
      ).toHaveLength(0);
    });

    it(`${file} contains no hex color literal`, () => {
      const violations = stripComments(read(file))
        .split('\n')
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter((entry) => entry.text && HEX_COLOR_REGEX.test(entry.text));
      expect(
        violations,
        `Found hex literal in ${file}:\n${violations.map((v) => `  L${v.line}: ${v.text}`).join('\n')}`,
      ).toHaveLength(0);
    });
  }

  for (const file of CSS_FILES) {
    it(`${file} uses tokens only (no hex/rgb/hsl)`, () => {
      const stripped = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(HEX_COLOR_REGEX.test(stripped), `Found hex literal in ${file}`).toBe(false);
      expect(/\brgb\(|\brgba\(|\bhsl\(|\bhsla\(/i.test(stripped), `Found rgb/hsl in ${file}`).toBe(false);
      expect(stripped).toContain('var(--ha-');
    });
  }
});
