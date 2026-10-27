import type {
  ApplyResultDTO,
  EffectivePolicyDTO,
  HostTemplateAssociationDTO,
} from '@/types/hostTemplateAssociations';

/**
 * Production build alias target. Fictional association data must never ship in prod
 * bundles — aliased in via vite.config when VITE_USE_FOUNDATION_FIXTURES !== 'true'.
 */
export const foundationAssociations: HostTemplateAssociationDTO[] = [];

export function foundationResolveHost(): EffectivePolicyDTO {
  throw new Error('Host-association foundation fixtures are excluded from production builds.');
}

export function foundationApply(): ApplyResultDTO {
  throw new Error('Host-association foundation fixtures are excluded from production builds.');
}
