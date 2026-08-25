import type { PipelineOperationsInventory } from './pipelineOperations.types';

/** Production build alias target — fictional pipeline fixtures never ship in prod. */
export const pipelineOperationsFixture: PipelineOperationsInventory = new Proxy(
  {} as PipelineOperationsInventory,
  {
    get(): never {
      throw new Error('Pipeline operations foundation fixtures are excluded from production builds.');
    },
  },
);
