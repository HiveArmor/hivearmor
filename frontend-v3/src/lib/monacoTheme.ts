/**
 * HiveArmor Monaco theme bridge.
 * Monaco requires resolved colour values, so both mode themes are generated
 * from the centralized CSS custom properties instead of duplicating literals.
 */

import type { editor } from 'monaco-editor';

import type { HaTheme } from '@/store/theme.store';

interface MonacoPalette {
  app: string;
  panel: string;
  elevated: string;
  border: string;
  foreground: string;
  secondary: string;
  tertiary: string;
  primary: string;
  critical: string;
  high: string;
  medium: string;
  low: string;
  intelligence: string;
}

function stripHash(value: string): string {
  return value.replace('#', '');
}

function withAlpha(value: string, alpha: string): string {
  return `${value.slice(0, 7)}${alpha}`;
}

function readPalette(theme: HaTheme): MonacoPalette {
  const root = document.documentElement;
  const previous = root.dataset.haTheme;
  root.dataset.haTheme = theme;
  const styles = getComputedStyle(root);
  const read = (name: string): string => styles.getPropertyValue(name).trim();
  const palette: MonacoPalette = {
    app: read('--ha-surface-app'),
    panel: read('--ha-surface-panel'),
    elevated: read('--ha-surface-elevated'),
    border: read('--ha-border-default'),
    foreground: read('--ha-foreground-primary'),
    secondary: read('--ha-foreground-secondary'),
    tertiary: read('--ha-foreground-tertiary'),
    primary: read('--ha-action-primary'),
    critical: read('--ha-severity-critical'),
    high: read('--ha-severity-high'),
    medium: read('--ha-severity-medium'),
    low: read('--ha-severity-low'),
    intelligence: read('--ha-intelligence-primary'),
  };

  if (previous) root.dataset.haTheme = previous;
  else delete root.dataset.haTheme;
  return palette;
}

function createTheme(theme: HaTheme): editor.IStandaloneThemeData {
  const palette = readPalette(theme);
  return {
    base: theme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: stripHash(palette.secondary), fontStyle: 'italic' },
      { token: 'keyword', foreground: stripHash(palette.intelligence), fontStyle: 'bold' },
      { token: 'identifier', foreground: stripHash(palette.foreground) },
      { token: 'string', foreground: stripHash(palette.low) },
      { token: 'number', foreground: stripHash(palette.high) },
      { token: 'operator', foreground: stripHash(palette.primary) },
      { token: 'delimiter', foreground: stripHash(palette.secondary) },
      { token: 'type', foreground: stripHash(palette.medium) },
      { token: 'function', foreground: stripHash(palette.primary) },
      { token: 'variable', foreground: stripHash(palette.foreground) },
      { token: 'constant', foreground: stripHash(palette.critical) },
      { token: 'tag', foreground: stripHash(palette.intelligence) },
      { token: 'attribute.name', foreground: stripHash(palette.medium) },
      { token: 'attribute.value', foreground: stripHash(palette.low) },
    ],
    colors: {
      'editor.background': palette.panel,
      'editor.foreground': palette.foreground,
      'editor.lineHighlightBackground': palette.elevated,
      'editorLineNumber.foreground': palette.tertiary,
      'editorLineNumber.activeForeground': palette.primary,
      'editor.selectionBackground': withAlpha(palette.primary, '40'),
      'editor.inactiveSelectionBackground': withAlpha(palette.primary, '20'),
      'editorCursor.foreground': palette.primary,
      'editor.findMatchBackground': withAlpha(palette.high, '60'),
      'editor.findMatchHighlightBackground': withAlpha(palette.high, '30'),
      'editorWidget.background': palette.elevated,
      'editorWidget.border': palette.border,
      'editorSuggestWidget.background': palette.elevated,
      'editorSuggestWidget.border': palette.border,
      'editorSuggestWidget.selectedBackground': withAlpha(palette.primary, '20'),
      'editorHoverWidget.background': palette.elevated,
      'editorHoverWidget.border': palette.border,
      'editorGutter.background': palette.panel,
      'editorGutter.modifiedBackground': palette.medium,
      'editorGutter.addedBackground': palette.low,
      'editorGutter.deletedBackground': palette.critical,
      'scrollbar.shadow': withAlpha(palette.foreground, '30'),
      'scrollbarSlider.background': withAlpha(palette.border, '40'),
      'scrollbarSlider.hoverBackground': withAlpha(palette.border, '60'),
      'scrollbarSlider.activeBackground': withAlpha(palette.border, '80'),
      'minimap.background': palette.panel,
      'minimapSlider.background': withAlpha(palette.border, '40'),
      'minimapSlider.hoverBackground': withAlpha(palette.border, '60'),
      'minimapSlider.activeBackground': withAlpha(palette.border, '80'),
    },
  };
}

/** Define both mode themes before an editor mounts. */
export function defineHiveArmorMonacoTheme(monaco: typeof import('monaco-editor')): void {
  monaco.editor.defineTheme('hivearmor-dark', createTheme('dark'));
  monaco.editor.defineTheme('hivearmor-light', createTheme('light'));
}
