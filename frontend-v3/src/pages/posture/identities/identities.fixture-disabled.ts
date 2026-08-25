import type {
  IdentityPostureFilters,
  IdentityPosturePage,
  IdentityPosturePreview,
} from './identity.types';

/** Production build alias target — fictional identity posture never ships in prod. */
export async function getFoundationIdentityPage(
  _filters: IdentityPostureFilters,
  _signal?: AbortSignal,
): Promise<IdentityPosturePage> {
  throw new Error('Identity foundation fixtures are excluded from production builds.');
}

export async function getFoundationIdentityPreview(
  _id: string,
  _signal?: AbortSignal,
): Promise<IdentityPosturePreview> {
  throw new Error('Identity foundation fixtures are excluded from production builds.');
}
