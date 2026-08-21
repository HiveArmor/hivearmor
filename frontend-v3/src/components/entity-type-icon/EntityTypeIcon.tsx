import type { LucideIcon } from 'lucide-react';
import {
  Binary, Box, Boxes, CircleHelp, Cloud, FileCode2, Globe2, Laptop,
  Network, ServerCog, UserRound,
} from 'lucide-react';

import { entityTypeLabel, normalizeEntityIconType } from './entityType';
import type { CanonicalEntityIconType } from './entityType';

const ENTITY_TYPE_ICONS: Record<CanonicalEntityIconType, LucideIcon> = {
  host: Laptop,
  user: UserRound,
  ip: Network,
  service: ServerCog,
  process: Binary,
  cloud: Cloud,
  domain: Globe2,
  network: Boxes,
  file: FileCode2,
  artifact: Box,
  unknown: CircleHelp,
};

export interface EntityTypeIconProps {
  type: string | null | undefined;
  size?: number;
  className?: string;
  labelled?: boolean;
}

export function EntityTypeIcon({ type, size = 14, className, labelled = false }: EntityTypeIconProps): JSX.Element {
  const normalized = normalizeEntityIconType(type);
  const Icon = ENTITY_TYPE_ICONS[normalized];
  const label = entityTypeLabel(type);
  return <Icon className={className} size={size} aria-hidden={labelled ? undefined : 'true'} aria-label={labelled ? `${label} entity` : undefined} />;
}
