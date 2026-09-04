import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { Monaco } from '@monaco-editor/react';
import { Editor } from '@monaco-editor/react';

import { getKqlHuntSuggestions } from '../huntQuerySuggestions';
import type { HuntQuerySuggestion } from '../huntQuerySuggestions';
import type { HuntFieldDefinition } from '../searchHunt.types';

export interface QueryBarProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  fields?: HuntFieldDefinition[];
  language?: 'kql';
  disabled?: boolean;
  placeholder?: string;
  /** Notifies the parent when the editor gains/loses focus (drives the one-row active-pane state). */
  onFocusChange?: (focused: boolean) => void;
  /**
   * Monotonic counter the parent bumps when the query pane transitions from collapsed to expanded.
   * On change we re-measure Monaco (editor.layout()) and focus it — Monaco cannot size itself while
   * clipped, so this is the explicit re-layout the collapse/expand model requires.
   */
  expandSignal?: number;
}

type MountedEditor = Parameters<NonNullable<React.ComponentProps<typeof Editor>['onMount']>>[0];

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme(monaco: Monaco): void {
  const light = document.documentElement.dataset.haTheme === 'light';
  monaco.editor.defineTheme('hive-hunt-query', {
    base: light ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: token('--ha-action-secondary').replace('#', ''), fontStyle: 'bold' },
      { token: 'string', foreground: token('--ha-severity-low').replace('#', '') },
    ],
    colors: {
      'editor.background': token('--ha-surface-input'),
      'editor.foreground': token('--ha-foreground-primary'),
      'editorCursor.foreground': token('--ha-action-primary'),
      'editor.selectionBackground': token('--ha-surface-selected'),
    },
  });
  monaco.editor.setTheme('hive-hunt-query');
}

export function QueryBar({
  value,
  onChange,
  onExecute,
  fields = [],
  language = 'kql',
  disabled = false,
  placeholder = 'Search normalized events…',
  onFocusChange,
  expandSignal = 0,
}: QueryBarProps): JSX.Element {
  const suggestionListId = useId();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MountedEditor | null>(null);
  const contentSizeDisposable = useRef<{ dispose: () => void } | null>(null);
  const keyboardDisposable = useRef<{ dispose: () => void } | null>(null);
  const focusDisposable = useRef<{ dispose: () => void } | null>(null);
  const blurDisposable = useRef<{ dispose: () => void } | null>(null);
  const themeObserver = useRef<MutationObserver | null>(null);
  const suggestionsRef = useRef<HuntQuerySuggestion[]>([]);
  const activeSuggestionRef = useRef(-1);
  const executeRef = useRef(onExecute);
  const changeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const focusChangeRef = useRef(onFocusChange);
  focusChangeRef.current = onFocusChange;
  const [editorHeight, setEditorHeight] = useState(38);
  const [focused, setFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const suggestions = useMemo(
    () => language === 'kql' ? getKqlHuntSuggestions(value, fields) : [],
    [fields, language, value],
  );
  const showSuggestions = focused && suggestions.length > 0 && !disabled;

  suggestionsRef.current = suggestions;
  activeSuggestionRef.current = activeSuggestionIndex;
  executeRef.current = onExecute;
  changeRef.current = onChange;
  disabledRef.current = disabled;

  useEffect(() => () => {
    contentSizeDisposable.current?.dispose();
    keyboardDisposable.current?.dispose();
    focusDisposable.current?.dispose();
    blurDisposable.current?.dispose();
    themeObserver.current?.disconnect();
  }, []);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !shellRef.current?.contains(target)) {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && shellRef.current?.contains(activeElement)) activeElement.blur();
        setFocused(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  // When the parent expands this pane from its collapsed (clipped) state, Monaco must be told to
  // re-measure — it cannot compute its own layout while width-clipped. Skip the initial mount (0).
  useEffect(() => {
    if (expandSignal === 0) return;
    const editor = editorRef.current;
    if (!editor) return;
    // Two rAFs: let the flex row settle to the expanded width before Monaco measures it.
    const raf1 = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editor.layout();
        editor.focus();
      });
    });
    return () => window.cancelAnimationFrame(raf1);
  }, [expandSignal]);

  const applySuggestion = useCallback((suggestion: HuntQuerySuggestion): void => {
    changeRef.current(suggestion.nextValue);
    setActiveSuggestionIndex(-1);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const model = editor.getModel();
      if (model) editor.setPosition(model.getPositionAt(model.getValueLength()));
    });
  }, []);

  const handleEditorMount = useCallback((editor: MountedEditor, monaco: Monaco) => {
    editorRef.current = editor;
    if (!monaco.languages.getLanguages().some((candidate) => candidate.id === 'hive-kql')) {
      monaco.languages.register({ id: 'hive-kql' });
      monaco.languages.setMonarchTokensProvider('hive-kql', {
        ignoreCase: true,
        tokenizer: {
          root: [
            [/\b(?:AND|OR|NOT)\b/, 'keyword'],
            [/"(?:\\.|[^"\\])*"/, 'string'],
            [/[!<>]=?|:/, 'operator'],
          ],
        },
      });
    }
    applyTheme(monaco);
    editor.updateOptions({
      wordWrap: 'on',
      lineNumbers: 'off',
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 8,
      lineNumbersMinChars: 0,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      renderLineHighlight: 'none',
    });

    const updateEditorHeight = (): void => {
      setEditorHeight(Math.max(38, Math.min(124, Math.ceil(editor.getContentHeight()))));
    };
    updateEditorHeight();
    contentSizeDisposable.current?.dispose();
    contentSizeDisposable.current = editor.onDidContentSizeChange(updateEditorHeight);

    keyboardDisposable.current?.dispose();
    keyboardDisposable.current = editor.onKeyDown((event) => {
      if (event.keyCode === monaco.KeyCode.DownArrow && suggestionsRef.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setActiveSuggestionIndex((current) => Math.min(suggestionsRef.current.length - 1, current + 1));
        return;
      }
      if (event.keyCode === monaco.KeyCode.UpArrow && suggestionsRef.current.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setActiveSuggestionIndex((current) => Math.max(-1, current - 1));
        return;
      }
      if (event.keyCode === monaco.KeyCode.Enter && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const selected = suggestionsRef.current[activeSuggestionRef.current];
        if (selected) applySuggestion(selected);
        else if (!disabledRef.current) executeRef.current();
        return;
      }
      if (event.keyCode === monaco.KeyCode.Tab && activeSuggestionRef.current >= 0) {
        event.preventDefault();
        event.stopPropagation();
        const selected = suggestionsRef.current[activeSuggestionRef.current];
        if (selected) applySuggestion(selected);
        return;
      }
      if (event.keyCode === monaco.KeyCode.Escape) {
        setFocused(false);
        setActiveSuggestionIndex(-1);
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (!disabledRef.current) executeRef.current();
    });
    focusDisposable.current?.dispose();
    focusDisposable.current = editor.onDidFocusEditorText(() => { setFocused(true); focusChangeRef.current?.(true); });
    blurDisposable.current?.dispose();
    blurDisposable.current = editor.onDidBlurEditorText(() => window.setTimeout(() => { setFocused(false); focusChangeRef.current?.(false); }, 100));

    themeObserver.current?.disconnect();
    themeObserver.current = new MutationObserver(() => applyTheme(monaco));
    themeObserver.current.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ha-theme'] });
  }, [applySuggestion]);

  return (
    <div ref={shellRef} className="hunt-query-editor-shell" role="combobox" aria-haspopup="listbox" aria-expanded={showSuggestions} aria-controls={suggestionListId}>
      <div className="hunt-query-editor" data-disabled={disabled || undefined} aria-label="Hunt query editor" style={{ height: editorHeight }}>
        <Editor
          height={`${editorHeight}px`}
          language="hive-kql"
          value={value}
          onChange={(next) => {
            onChange(next ?? '');
            setFocused(true);
            setActiveSuggestionIndex(-1);
          }}
          onMount={handleEditorMount}
          theme="hive-hunt-query"
          options={{
            ariaLabel: 'KQL search query. Press Enter to run, Shift Enter for a new line, or use arrow keys for suggestions.',
            fontSize: 12,
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
            padding: { top: 7, bottom: 6 },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            parameterHints: { enabled: false },
            renderLineHighlight: 'none',
            readOnly: disabled,
            scrollbar: { vertical: 'auto', horizontal: 'auto', verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
          }}
          loading={<div className="hunt-query-editor__loading">{placeholder}</div>}
        />
        {!value && !focused && <span className="hunt-query-editor__placeholder">Start typing for KQL suggestions · Enter loads the newest 100 events</span>}
      </div>
      {showSuggestions && <div id={suggestionListId} className="hunt-query-suggestions" role="listbox" aria-label="KQL query suggestions">
        {suggestions.map((suggestion, index) => <button
          key={suggestion.id}
          type="button"
          role="option"
          aria-selected={activeSuggestionIndex === index}
          data-active={activeSuggestionIndex === index}
          data-kind={suggestion.kind}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveSuggestionIndex(index)}
          onClick={() => applySuggestion(suggestion)}
        >
          <span>{suggestion.kind === 'operator' ? 'Logic' : suggestion.kind === 'field' ? 'Field' : 'Value'}</span>
          <strong>{suggestion.label}</strong>
          <small>{suggestion.detail}</small>
        </button>)}
        <footer><span>↑↓ Navigate</span><span>Enter Apply / run</span><span>Shift+Enter New line</span><span>Esc Close</span></footer>
      </div>}
    </div>
  );
}
