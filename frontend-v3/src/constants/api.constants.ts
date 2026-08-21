/**
 * API Query Key Constants
 * TanStack Query key conventions — used in all service hooks.
 */

export const QUERY_KEYS = {
  // Auth
  account: ['account'] as const,

  // Alerts
  alerts: (params?: object) => ['alerts', params] as const,
  alertCount: ['alerts', 'count'] as const,

  // Incidents
  incidents: (params?: object) => ['incidents', params] as const,
  incident: (id: string | number) => ['incidents', id] as const,
  incidentTimeline: (id: string | number) => ['incidents', id, 'timeline'] as const,
  incidentEvidence: (id: string | number) => ['incidents', id, 'evidence'] as const,
  incidentEntities: (id: string | number) => ['incidents', id, 'entities'] as const,
  incidentEntityGraph: (id: string | number) => ['incidents', id, 'entity-graph'] as const,

  // Rules
  rules: (params?: object) => ['rules', params] as const,
  rule: (id: string | number) => ['rules', id] as const,
  rulePacks: ['rules', 'packs'] as const,

  // Dashboards
  dashboards: ['dashboards'] as const,
  dashboard: (id: string | number) => ['dashboards', id] as const,

  // Users
  users: (params?: object) => ['users', params] as const,
  usersAssigned: ['users', 'assigned'] as const,

  // Clients
  clients: ['clients'] as const,
  client: (id: string | number) => ['clients', id] as const,

  // Audit
  auditEvents: (params?: object) => ['audit', params] as const,

  // Search
  savedQueries: ['saved-queries'] as const,

  // Notifications
  notifications: ['notifications'] as const,

  // Active Directory (reserved — no backend endpoint yet)
  adDomainSummary: (domain: string) => ['ad-domain-summary', domain] as const,
  adTrackerEvents: (params?: object) => ['ad-tracker-events', params] as const,
  adReportSummary: (domain: string) => ['ad-report-summary', domain] as const,
} as const;
