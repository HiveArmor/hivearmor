/**
 * useDocumentTitle — set the browser tab title per page (design system C3).
 *
 * The app currently has no per-page title (only a static `HiveArmor` in index.html and one ad-hoc
 * set in CommandCenter). This hook standardizes the convention `"<page> — HiveArmor"`, so every
 * route can set a meaningful tab/history/bookmark label. Pairs with HaPageHeader — pass the same
 * title. Restores the previous title on unmount so transient routes don't leave a stale tab.
 */
import { useEffect } from 'react';

export const APP_TITLE = 'HiveArmor';

/**
 * @param title The page name (e.g. "Alerts"). Rendered as `"Alerts — HiveArmor"`.
 *   Pass an empty string to show just the app name.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
