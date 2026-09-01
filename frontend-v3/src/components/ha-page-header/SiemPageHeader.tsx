/**
 * SiemPageHeader — DEPRECATED alias of HaPageHeader (C3).
 *
 * Kept so the ~11 existing consumers keep working unchanged while they migrate to `HaPageHeader`.
 * New code must import `HaPageHeader`. Per the deprecation policy (plan §6) this alias is removed
 * after 2 releases. The old filled 64px header is gone — this now renders the locked compact
 * no-fill band via HaPageHeader.
 *
 * @deprecated Use `HaPageHeader` from '@/components/ha-page-header' instead.
 */
import { HaPageHeader, type HaPageHeaderProps, type HaBreadcrumbItem } from './HaPageHeader';

export type BreadcrumbItem = HaBreadcrumbItem;
export type SiemPageHeaderProps = HaPageHeaderProps;

/** @deprecated Use `HaPageHeader`. */
export function SiemPageHeader(props: SiemPageHeaderProps): JSX.Element {
  return <HaPageHeader {...props} />;
}
