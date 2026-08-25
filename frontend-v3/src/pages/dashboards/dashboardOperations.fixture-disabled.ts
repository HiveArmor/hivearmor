import type { DashboardRecord } from './dashboardOperations.types';

/** Production build alias target — fictional dashboard fixtures never ship in prod. */
export function listDashboardFixtures(): DashboardRecord[] {
  throw new Error('Dashboard foundation fixtures are excluded from production builds.');
}

export function getDashboardFixture(_id: string): DashboardRecord | undefined {
  throw new Error('Dashboard foundation fixtures are excluded from production builds.');
}

export function saveDashboardFixture(_dashboard: DashboardRecord): DashboardRecord {
  throw new Error('Dashboard foundation fixtures are excluded from production builds.');
}
