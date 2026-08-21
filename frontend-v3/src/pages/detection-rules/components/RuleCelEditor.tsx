/**
 * RuleCelEditor — Monaco editor with CEL syntax highlighting,
 * autocomplete for SDK functions, field name suggestions (Sprint 47 DET-011/DET-016)
 */

import { useCallback, useEffect, useRef } from 'react';

import type { Monaco } from '@monaco-editor/react';
import { Editor } from '@monaco-editor/react';
import type * as monacoEditor from 'monaco-editor';

import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';

interface RuleCelEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

/** CEL SDK function names that must never be renamed (per firm constraint §11.6) */
const CEL_FUNCTIONS = [
  'celExists', 'safe', 'inCIDR', 'equals', 'equalsIgnoreCase',
  'contains', 'containsAll', 'oneOf', 'startsWith', 'endsWith', 'regexMatch',
];

/** Common ECS field names available for autocomplete */
const ECS_FIELDS = [
  'source.ip', 'destination.ip', 'source.port', 'destination.port',
  'process.name', 'process.executable', 'process.command_line', 'process.pid',
  'process.parent.name', 'process.parent.executable',
  'user.name', 'user.domain', 'user.id',
  'host.name', 'host.ip', 'host.os.family',
  'file.path', 'file.name', 'file.hash.sha256',
  'network.protocol', 'network.direction',
  'event.action', 'event.category', 'event.type', 'event.outcome',
  'dns.question.name', 'dns.resolved_ip',
  'registry.key', 'registry.value',
  'http.request.method', 'http.response.status_code',
  'url.full', 'url.domain',
];

const CEL_LANGUAGE_ID = 'cel';

function registerCelLanguage(monaco: Monaco): void {
  if (monaco.languages.getLanguages().some((lang) => lang.id === CEL_LANGUAGE_ID)) return;

  monaco.languages.register({ id: CEL_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(CEL_LANGUAGE_ID, {
    keywords: ['true', 'false', 'null', 'in', 'has'],
    operators: ['&&', '||', '!', '==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%'],
    functions: CEL_FUNCTIONS,
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/[a-zA-Z_]\w*(?=\s*\()/, {
          cases: {
            '@functions': 'keyword.function',
            '@default': 'identifier',
          },
        }],
        [/[a-zA-Z_][\w.]*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        }],
        [/[{}()[\]]/, 'bracket'],
        [/&&|\|\||[!=<>]=?|[+\-*/%]/, 'operator'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration(CEL_LANGUAGE_ID, {
    brackets: [['(', ')'], ['[', ']'], ['{', '}']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    comments: { lineComment: '//' },
  });
}

function registerCelCompletions(monaco: Monaco): monacoEditor.IDisposable {
  return monaco.languages.registerCompletionItemProvider(CEL_LANGUAGE_ID, {
    triggerCharacters: ['.', '('],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const functionSuggestions = CEL_FUNCTIONS.map((fn) => ({
        label: fn,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: `${fn}($0)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: 'HiveArmor CEL SDK',
        range,
      }));

      const fieldSuggestions = ECS_FIELDS.map((field) => ({
        label: field,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: field,
        detail: 'ECS field',
        range,
      }));

      return { suggestions: [...functionSuggestions, ...fieldSuggestions] };
    },
  });
}

export function RuleCelEditor({
  value,
  onChange,
  readOnly = false,
  height = '300px',
}: RuleCelEditorProps): JSX.Element {
  const theme = useThemeStore((state) => state.theme);
  const completionRef = useRef<monacoEditor.IDisposable | null>(null);

  useEffect(() => () => {
    completionRef.current?.dispose();
  }, []);

  const handleEditorMount = useCallback(
    (_editor: monacoEditor.editor.IStandaloneCodeEditor, monaco: Monaco): void => {
      registerCelLanguage(monaco);
      defineHiveArmorMonacoTheme(monaco);
      monaco.editor.setTheme(`hivearmor-${theme}`);

      completionRef.current?.dispose();
      completionRef.current = registerCelCompletions(monaco);
    },
    [theme]
  );

  return (
    <div className="rule-cel-editor" aria-label="CEL expression editor">
      <Editor
        height={height}
        language={CEL_LANGUAGE_ID}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleEditorMount}
        beforeMount={(monaco) => {
          registerCelLanguage(monaco);
          defineHiveArmorMonacoTheme(monaco);
        }}
        theme={`hivearmor-${theme}`}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 12,
          lineHeight: 19,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          renderLineHighlight: 'line',
          padding: { top: 9, bottom: 9 },
          readOnly,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          folding: true,
        }}
      />
    </div>
  );
}
