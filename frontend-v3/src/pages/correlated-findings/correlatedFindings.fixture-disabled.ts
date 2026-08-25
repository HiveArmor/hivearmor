import type { CorrelatedFindingDTO } from './correlatedFindings.types';

/** Production build alias target — fictional correlated findings never ship in prod. */
export const foundationCorrelatedFindings: CorrelatedFindingDTO[] = new Proxy(
  [] as CorrelatedFindingDTO[],
  {
    get(): never {
      throw new Error('Correlated findings foundation fixtures are excluded from production builds.');
    },
  },
);

export function getFoundationCorrelatedFinding(_id: string): CorrelatedFindingDTO | null {
  throw new Error('Correlated findings foundation fixtures are excluded from production builds.');
}
