/**
 * HiveArmor design-token resolution utilities.
 *
 * `resolveHaToken` reads a single `--ha-*` CSS custom property from the
 * document root at call time.  Use this for one-off lookups outside React.
 *
 * `useHaThemeTokens` is the React hook equivalent — it memoises the resolved
 * values so ECharts option objects are only rebuilt when the token list
 * reference changes.
 *
 * IMPORTANT: never pass `var(--ha-*)` strings directly into ECharts option
 * objects.  Always resolve via `resolveHaToken` (or this hook) at render time.
 */

import { useMemo } from 'react';

import { useThemeStore } from '@/store/theme.store';

export type HaThemeToken =
  | '--ha-background'
  | '--ha-surface-primary'
  | '--ha-surface-raised'
  | '--ha-border'
  | '--ha-primary'
  | '--ha-intelligence'
  | '--ha-critical'
  | '--ha-high'
  | '--ha-medium'
  | '--ha-positive'
  | '--ha-text-primary'
  | '--ha-text-secondary';

/**
 * Resolves a single HiveArmor design token to its current CSS value.
 *
 * Reads from `getComputedStyle(document.documentElement)` so it always
 * reflects the active theme at call time.
 */
export function resolveHaToken(token: HaThemeToken): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/** Applies an alpha channel to a resolved rgb/rgba token value. */
export function withHaAlpha(color: string, alpha: number): string {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3);
  if (!channels || channels.length < 3) return color;
  return `rgba(${channels.join(', ')}, ${alpha})`;
}

/**
 * React hook that resolves a tuple of HiveArmor design tokens to their
 * current CSS values, memoised against the `tokens` reference.
 *
 * @example
 * const { '--ha-primary': primary, '--ha-critical': critical } =
 *   useHaThemeTokens(['--ha-primary', '--ha-critical'] as const);
 */
export function useHaThemeTokens<T extends readonly HaThemeToken[]>(
  tokens: T,
): Record<T[number], string> {
  const theme = useThemeStore((state) => state.theme);

  return useMemo(() => {
    // Reading `theme` intentionally invalidates resolved canvas colours when
    // the root token set changes between dark and light modes.
    void theme;
    const out = {} as Record<T[number], string>;
    for (const t of tokens) {
      (out as Record<HaThemeToken, string>)[t] = resolveHaToken(t);
    }
    return out;
  }, [theme, tokens]);
}
