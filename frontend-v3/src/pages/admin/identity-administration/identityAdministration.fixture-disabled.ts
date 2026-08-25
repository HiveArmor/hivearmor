import type { IdentityAdministrationInventory } from './identityAdministration.types';

/** Production build alias target — fictional identity admin fixtures never ship in prod. */
export const identityAdministrationFixture: IdentityAdministrationInventory = new Proxy(
  {} as IdentityAdministrationInventory,
  {
    get(): never {
      throw new Error('Identity administration foundation fixtures are excluded from production builds.');
    },
  },
);
