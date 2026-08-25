import type { ReportingInventory } from './reportingOperations.types';

/** Production build alias target — fictional reporting fixtures never ship in prod. */
export const reportingOperationsFixture: ReportingInventory = new Proxy(
  {} as ReportingInventory,
  {
    get(): never {
      throw new Error('Reporting foundation fixtures are excluded from production builds.');
    },
  },
);
