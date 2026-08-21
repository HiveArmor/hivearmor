/**
 * MonacoEditorView — lightweight read-only or editable Monaco editor wrapper.
 * Lazy-loaded; import via React.lazy() only when needed.
 */

import EditorImport from '@monaco-editor/react';

const Editor = (typeof EditorImport === 'object' && EditorImport !== null && 'default' in EditorImport)
  ? (EditorImport as unknown as { default: typeof EditorImport }).default
  : EditorImport;

import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';

export interface MonacoEditorViewProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  height?: string | number;
}

export default function MonacoEditorView({
  value,
  language = 'yaml',
  readOnly = false,
  onChange,
  height = 400,
}: MonacoEditorViewProps): JSX.Element {
  const isDark = useThemeStore((s) => s.theme !== 'light');

  return (
    <Editor
      height={height}
      defaultLanguage={language}
      value={value}
      theme={isDark ? 'ha-dark' : 'vs-light'}
      options={{
        readOnly,
        fontSize: 12,
        fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        lineNumbers: 'on',
        scrollbar: {
          verticalScrollbarSize: 4,
          horizontalScrollbarSize: 4,
        },
      }}
      beforeMount={(monaco) => {
        defineHiveArmorMonacoTheme(monaco);
      }}
      onChange={(v) => {
        if (!readOnly && onChange) onChange(v ?? '');
      }}
    />
  );
}
