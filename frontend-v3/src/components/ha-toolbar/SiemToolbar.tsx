/**
 * SiemToolbar — DEPRECATED alias of HaToolbar (C3).
 *
 * The original SiemToolbar had no consumers (dead code) and used a filled surface + stale-alias
 * tokens. It is now a thin alias forwarding to HaToolbar (the locked sticky control strip) so any
 * future import resolves, and is removed after 2 releases.
 *
 * @deprecated Use `HaToolbar` from '@/components/ha-toolbar' instead.
 */
import { HaToolbar, type HaToolbarProps, type HaFilterChip } from './HaToolbar';

export type FilterChip = HaFilterChip;
export type SiemToolbarProps = HaToolbarProps;

/** @deprecated Use `HaToolbar`. */
export function SiemToolbar(props: SiemToolbarProps): JSX.Element {
  return <HaToolbar {...props} />;
}
