/**
 * Property 4: No dangerouslySetInnerHTML and no external markdown library.
 *
 * Static analysis test: reads sprint-25 source files and asserts that:
 * 1. No file contains `dangerouslySetInnerHTML`
 * 2. No file imports react-markdown, marked, markdown-it, remark, remark-parse, showdown
 *
 * Validates: Requirements 10.3, 10.4, 10.5, 22.3, 22.4
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');

// Sprint-25 source files to inspect
const SPRINT25_FILES = [
  'src/types/ai.types.ts',
  'src/services/aiChatService.ts',
  'src/components/ai-chat/AiChatPanel.tsx',
  'src/components/ai-chat/AiChatPanel.module.css',
  'src/components/ai-chat/AiTriageSection.tsx',
  'src/components/ai-chat/AiIncidentSummaryCard.tsx',
  'src/components/ai-chat/AiIncidentSummaryCard.module.css',
  'src/components/ai-chat/AiChatHistoryList.tsx',
  'src/hooks/useAiTriage.ts',
  'src/hooks/useIncidentAiSummary.ts',
];

const FORBIDDEN_INNER_HTML = /dangerouslySetInnerHTML\s*=/;
const FORBIDDEN_MARKDOWN_LIBS =
  /from\s+['"](?:react-markdown|markdown-it|marked|remark|remark-parse|showdown)['"]/;

function readFileSafe(relativePath: string): string | null {
  const fullPath = path.join(ROOT, 'frontend-v3', relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

describe('Property 4: NoDangerouslySetInnerHtml and NoExternalMarkdownLibrary', () => {
  for (const file of SPRINT25_FILES) {
    it(`${file} — no dangerouslySetInnerHTML`, () => {
      const content = readFileSafe(file);
      if (content === null) return; // file not yet created — skip
      expect(
        FORBIDDEN_INNER_HTML.test(content),
        `${file} must NOT contain dangerouslySetInnerHTML`,
      ).toBe(false);
    });

    it(`${file} — no external markdown library import`, () => {
      const content = readFileSafe(file);
      if (content === null) return;
      expect(
        FORBIDDEN_MARKDOWN_LIBS.test(content),
        `${file} must NOT import react-markdown, marked, markdown-it, remark, remark-parse, or showdown`,
      ).toBe(false);
    });
  }
});
