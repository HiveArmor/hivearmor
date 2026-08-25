import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

/**
 * Production build alias target. Fictional compliance aggregates must never ship in prod.
 * Named exports match compliance.fixtures.ts so the Vite alias is shape-compatible.
 */
function unavailable(): never {
  throw new Error('Compliance foundation fixtures are excluded from production builds.');
}

export const compliancePostureFixture = new Proxy({} as HivePostureScoreDTO, {
  get() {
    return unavailable();
  },
});

export const complianceFrameworkFixtures = new Proxy([] as HiveFrameworkScoreDTO[], {
  get(target, prop) {
    if (prop === 'length') return 0;
    if (prop === Symbol.iterator) {
      return function* empty() { /* empty */ };
    }
    if (typeof prop === 'symbol') return Reflect.get(target, prop);
    return unavailable();
  },
});
