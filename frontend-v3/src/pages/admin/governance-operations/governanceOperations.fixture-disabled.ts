import type { GovernanceInventory } from './governanceOperations.types';

/** Production build alias target — fictional governance fixtures never ship in prod. */
export const governanceOperationsFixture: GovernanceInventory = new Proxy(
  {} as GovernanceInventory,
  {
    get(): never {
      throw new Error('Governance operations foundation fixtures are excluded from production builds.');
    },
  },
);
