import type { IntegrationOperationsInventory } from './integrationOperations.types';

/** Production build alias target — fictional integration fixtures never ship in prod. */
export const integrationOperationsFixture: IntegrationOperationsInventory = new Proxy(
  {} as IntegrationOperationsInventory,
  {
    get(): never {
      throw new Error('Integration operations foundation fixtures are excluded from production builds.');
    },
  },
);
