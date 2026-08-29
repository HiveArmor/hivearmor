/**
 * Application route constants.
 * Full set implemented in S02 (design system session).
 */

export const ROUTES = {
  LOGIN: '/login',
  LOGIN_TFA: '/login/tfa',
  HOME: '/',

  // COMMAND
  QUEUE: '/queue',
  ALERTS: '/alerts',
  ALERTS_SEVERITY: '/alerts/severity',
  ALERTS_BOARD: '/alerts/board',
  CORRELATED_FINDINGS: '/correlated-findings',
  OFFENSES: '/offenses',
  INCIDENTS: '/incidents',

  // INVESTIGATE
  SEARCH: '/search',
  HUNT: '/hunt',
  INVESTIGATIONS: '/investigations',
  ENTITIES: '/entities',
  INTELLIGENCE: '/intelligence',

  // DEFEND
  DETECTION_RULES: '/detection-rules',
  RULES: '/rules',
  RESPONSE_PLAYBOOKS: '/response/playbooks',
  RESPONSE_ACTIVITY: '/response/activity',
  RESPONSE_AUTHORITY: '/response/authority',
  RESPONSE_QUARANTINE: '/response/quarantine',
  RESPONSE_LIBRARY: '/response/library',
  DASHBOARD: '/dashboard',
  EDR_ENDPOINTS: '/edr/endpoints',
  EDR_FIM: '/edr/fim',
  EDR_POLICIES: '/edr/policies',

  // POSTURE
  ASSETS: '/posture/assets',
  IDENTITIES: '/posture/identities',
  ACTIVE_DIRECTORY: '/posture/active-directory',
  EXPOSURE: '/posture/exposure',
  SENSORS: '/posture/sensors',
  COMPLIANCE: '/compliance',

  // UEBA
  UEBA_RISK: '/ueba/risk',
  UEBA_ENTITY_TIMELINE: '/ueba/entity-timeline',

  // DASHBOARDS
  DASHBOARDS: '/dashboards',
  DASHBOARD_STUDIO: '/dashboards/studio',

  // REPORT
  REPORTS_SITREP: '/reports/sitrep',
  REPORTS_INCIDENTS: '/reports/incidents',
  REPORTS_AFTER_ACTION: '/reports/after-action',
  REPORTS_SCHEDULED: '/reports/scheduled',
  REPORTS_TEMPLATES: '/reports/templates',

  // ADMINISTRATION
  ADMIN_USERS: '/admin/users',
  ADMIN_TENANTS: '/admin/tenants',
  ADMIN_INTEGRATIONS: '/admin/integrations',
  ADMIN_CONNECTORS: '/admin/connectors',
  ADMIN_NOTIFICATIONS: '/admin/notifications',
  ADMIN_CONNECTION_KEYS: '/admin/connection-keys',
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_ENROLLMENT_AUDIT: '/admin/enrollment-audit',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_THREAT_INTEL: '/admin/threat-intel',
  ADMIN_PIPELINE_SIGNALS: '/admin/pipeline-signals',
} as const;

export type RouteValue = (typeof ROUTES)[keyof typeof ROUTES];
