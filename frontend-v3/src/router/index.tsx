/**
 * Router — React Router v6 routes for HiveArmor frontend-v3.
 * All routes except /login and /login/tfa are wrapped in AuthGuard.
 * All page components are lazy-loaded for code splitting.
 */

/* eslint-disable react-refresh/only-export-components */

import React from 'react';

import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';

import { AppLayout } from './AppLayout';
import { AuthGuard } from './AuthGuard';

import { msspRouteChildren, MsspPortalOutlet } from '@/features/mssp/routes/msspRoutes';
import { ALERT_QUEUE_ROLES } from '@/services/findingStatus.capabilities';

/** Legacy /offenses/:id → /correlated-findings/:id (preserve document id). */
function OffenseIdRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/correlated-findings/${encodeURIComponent(id)}` : '/correlated-findings'} replace />;
}

/** Wave A2 A2-ENT-01: /entities/:id → canonical dossier (legacy detail called missing APIs). */
function EntityIdToDossierRedirect(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/entities/${encodeURIComponent(id)}/dossier` : '/entities'} replace />;
}

// ── Admin pages ──────────────────────────────────────────────────────────────
const RuleGenerationPage = React.lazy(() =>
  import('@/pages/admin/rule-generation/RuleGenerationPage').then(m => ({ default: m.RuleGenerationPage }))
);
const GovernanceOperationsPage = React.lazy(() =>
  import('@/pages/admin/governance-operations/GovernanceOperationsPage').then(m => ({ default: m.GovernanceOperationsPage }))
);
const DataParsingPage = React.lazy(() =>
  import('@/pages/admin/data-parsing/DataParsingPage').then(m => ({ default: m.DataParsingPage }))
);
const AdminIntegrationsPage = React.lazy(() =>
  import('@/pages/admin/integrations/AdminIntegrationsPage').then(m => ({ default: m.AdminIntegrationsPage }))
);
const ConnectorSdkPage = React.lazy(() =>
  import('@/pages/admin/connectors/ConnectorSdkPage').then(m => ({ default: m.ConnectorSdkPage }))
);
const AdminNotificationsPage = React.lazy(() =>
  import('@/pages/admin/notifications/AdminNotificationsPage').then(m => ({ default: m.AdminNotificationsPage }))
);
const RuleImportPage = React.lazy(() => import('@/pages/admin/RuleImportPage'));
const RuleTestingPage = React.lazy(() => import('@/pages/admin/RuleTestingPage'));
const ScimConfigPage = React.lazy(() => import('@/pages/admin/ScimConfigPage'));
const SsoProvidersPage = React.lazy(() => import('@/pages/admin/SsoProvidersPage'));
const PipelineSignalsPage = React.lazy(() =>
  import('@/pages/admin/pipeline-signals/PipelineSignalsPage').then(m => ({ default: m.PipelineSignalsPage }))
);
const AdminTenantsPage = React.lazy(() =>
  import('@/pages/admin/tenants/AdminTenantsPage').then(m => ({ default: m.AdminTenantsPage }))
);
const AdminUsersPage = React.lazy(() =>
  import('@/pages/admin/users/AdminUsersPage').then(m => ({ default: m.AdminUsersPage }))
);

// ── Settings ──────────────────────────────────────────────────────────────────
const ApiKeyPage = React.lazy(() =>
  import('@/pages/settings/ApiKeyPage').then(m => ({ default: m.ApiKeyPage }))
);

// ── Inputs ────────────────────────────────────────────────────────────────────
const DataSourceStatusPage = React.lazy(() =>
  import('@/pages/inputs/DataSourceStatusPage').then(m => ({ default: m.DataSourceStatusPage }))
);

// ── Admin — Threat Intel ──────────────────────────────────────────────────────
const ThreatIntelAdminPage = React.lazy(() =>
  import('@/pages/admin/threat-intel/ThreatIntelAdminPage').then(m => ({ default: m.ThreatIntelAdminPage }))
);

// ── Alert pages ───────────────────────────────────────────────────────────────
const AlertSeverityBoardPage = React.lazy(() =>
  import('@/pages/alerts/AlertSeverityBoardPage').then(m => ({ default: m.AlertSeverityBoardPage }))
);
const AlertsListPage = React.lazy(() =>
  import('@/pages/alerts/AlertsListPage').then(m => ({ default: m.AlertsListPage }))
);
const AlertInvestigationPage = React.lazy(() =>
  import('@/pages/alerts/AlertInvestigationPage').then(m => ({ default: m.AlertInvestigationPage }))
);

// ── Analyst queue ─────────────────────────────────────────────────────────────
const AnalystQueuePage = React.lazy(() =>
  import('@/pages/analyst-queue/AnalystQueuePage').then(m => ({ default: m.AnalystQueuePage }))
);

// ── Auth pages (kept lazy — shown after redirect, not blocking) ───────────────
const AccessDeniedPage = React.lazy(() =>
  import('@/pages/auth/AccessDeniedPage').then(m => ({ default: m.AccessDeniedPage }))
);
const LoginPage = React.lazy(() =>
  import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage }))
);
const OidcCallbackPage = React.lazy(() => import('@/pages/auth/OidcCallbackPage'));
const TfaPage = React.lazy(() =>
  import('@/pages/auth/TfaPage').then(m => ({ default: m.TfaPage }))
);

// ── Command center ────────────────────────────────────────────────────────────
const CommandCenterPage = React.lazy(() =>
  import('@/pages/command-center/CommandCenterPage').then(m => ({ default: m.CommandCenterPage }))
);

// ── Compliance ────────────────────────────────────────────────────────────────
const CompliancePage = React.lazy(() =>
  import('@/pages/compliance/CompliancePage').then(m => ({ default: m.CompliancePage }))
);

// ── Constellation ─────────────────────────────────────────────────────────────
const ThreatConstellationPage = React.lazy(() =>
  import('@/pages/constellation/ThreatConstellationPage').then(m => ({ default: m.ThreatConstellationPage }))
);

// ── Correlated findings (Phase 4 production workbench) ──────────────────────
const CorrelatedFindingDetailPage = React.lazy(() =>
  import('@/pages/correlated-findings/CorrelatedFindingDetailPage').then(m => ({ default: m.CorrelatedFindingDetailPage }))
);
const CorrelatedFindingsPage = React.lazy(() =>
  import('@/pages/correlated-findings/CorrelatedFindingsPage').then(m => ({ default: m.CorrelatedFindingsPage }))
);

// ── Dashboards ────────────────────────────────────────────────────────────────
const DashboardGalleryPage = React.lazy(() =>
  import('@/pages/dashboards/DashboardGalleryPage').then(m => ({ default: m.DashboardGalleryPage }))
);
const DashboardStudioPage = React.lazy(() =>
  import('@/pages/dashboards/DashboardStudioPage').then(m => ({ default: m.DashboardStudioPage }))
);
const DashboardViewPage = React.lazy(() =>
  import('@/pages/dashboards/DashboardViewPage').then(m => ({ default: m.DashboardViewPage }))
);
const MetricsBuilderPage = React.lazy(() =>
  import('@/pages/dashboards/MetricsBuilderPage').then(m => ({ default: m.MetricsBuilderPage }))
);

// ── Detection rules ───────────────────────────────────────────────────────────
const DetectionRulesPage = React.lazy(() =>
  import('@/pages/detection-rules/DetectionRulesPage').then(m => ({ default: m.DetectionRulesPage }))
);
const RuleEditorPage = React.lazy(() =>
  import('@/pages/detection-rules/RuleEditorPage').then(m => ({ default: m.RuleEditorPage }))
);
const RuleTestPage = React.lazy(() =>
  import('@/pages/detection-rules/RuleTestPage').then(m => ({ default: m.RuleTestPage }))
);

// ── Entities ──────────────────────────────────────────────────────────────────
const EntityDossierPage = React.lazy(() =>
  import('@/pages/entities/EntityDossierPage').then(m => ({ default: m.EntityDossierPage }))
);
const EntityInventoryPage = React.lazy(() =>
  import('@/pages/entities/EntityInventoryPage').then(m => ({ default: m.EntityInventoryPage }))
);
// EntityListPage retired in Sprint 45 — replaced by EntityInventoryPage

// ── Incidents ─────────────────────────────────────────────────────────────────
const IncidentDetailPage = React.lazy(() =>
  import('@/pages/incidents/IncidentDetailPage').then(m => ({ default: m.IncidentDetailPage }))
);
const IncidentListPage = React.lazy(() =>
  import('@/pages/incidents/IncidentListPage').then(m => ({ default: m.IncidentListPage }))
);

// ── Intelligence ──────────────────────────────────────────────────────────────
const HiveIntelligencePage = React.lazy(() =>
  import('@/pages/intelligence/HiveIntelligencePage').then(m => ({ default: m.HiveIntelligencePage }))
);

// ── Investigations ────────────────────────────────────────────────────────────
const InvestigationDetailPage = React.lazy(() =>
  import('@/pages/investigations/InvestigationDetailPage').then(m => ({ default: m.InvestigationDetailPage }))
);
const InvestigationsPage = React.lazy(() =>
  import('@/pages/investigations/InvestigationsPage').then(m => ({ default: m.InvestigationsPage }))
);

// ── Not found ─────────────────────────────────────────────────────────────────
const NotFoundPage = React.lazy(() =>
  import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage }))
);

// ── Posture ───────────────────────────────────────────────────────────────────
const ActiveDirectoryPage = React.lazy(() =>
  import('@/pages/posture/active-directory/ActiveDirectoryPage').then(m => ({ default: m.ActiveDirectoryPage }))
);
const AssetsPage = React.lazy(() =>
  import('@/pages/posture/assets/AssetsPage').then(m => ({ default: m.AssetsPage }))
);
const ExposurePage = React.lazy(() =>
  import('@/pages/posture/exposure/ExposurePage').then(m => ({ default: m.ExposurePage }))
);
const IdentitiesPage = React.lazy(() =>
  import('@/pages/posture/identities/IdentitiesPage').then(m => ({ default: m.IdentitiesPage }))
);
const ReadinessMatrixPage = React.lazy(() =>
  import('@/pages/posture/readiness/ReadinessMatrixPage').then(m => ({ default: m.ReadinessMatrixPage }))
);
const SensorGridPage = React.lazy(() =>
  import('@/pages/posture/sensors/SensorGridPage').then(m => ({ default: m.SensorGridPage }))
);
const VulnerabilitiesPage = React.lazy(() =>
  import('@/pages/posture/vulnerabilities/VulnerabilitiesPage').then(m => ({ default: m.VulnerabilitiesPage }))
);

// ── Reports ───────────────────────────────────────────────────────────────────
const AfterActionReportsPage = React.lazy(() =>
  import('@/pages/reports/AfterActionReportsPage').then(m => ({ default: m.AfterActionReportsPage }))
);
const IncidentReportsPage = React.lazy(() =>
  import('@/pages/reports/IncidentReportsPage').then(m => ({ default: m.IncidentReportsPage }))
);
const ReportTemplatesPage = React.lazy(() =>
  import('@/pages/reports/ReportTemplatesPage').then(m => ({ default: m.ReportTemplatesPage }))
);
const ScheduledReportsPage = React.lazy(() =>
  import('@/pages/reports/ScheduledReportsPage').then(m => ({ default: m.ScheduledReportsPage }))
);
const SitrepReportPage = React.lazy(() =>
  import('@/pages/reports/SitrepReportPage').then(m => ({ default: m.SitrepReportPage }))
);

// ── Response / SOAR ───────────────────────────────────────────────────────────
const PlaybookBuilderPage = React.lazy(() =>
  import('@/pages/response/PlaybookBuilderPage').then(m => ({ default: m.PlaybookBuilderPage }))
);
const ResponseLibraryPage = React.lazy(() =>
  import('@/pages/response/ResponseLibraryPage').then(m => ({ default: m.ResponseLibraryPage }))
);
const PlaybookDetailPage = React.lazy(() =>
  import('@/pages/response/PlaybookDetailPage').then(m => ({ default: m.PlaybookDetailPage }))
);
const PlaybooksPage = React.lazy(() =>
  import('@/pages/response/PlaybooksPage').then(m => ({ default: m.PlaybooksPage }))
);
const ResponseActivityPage = React.lazy(() =>
  import('@/pages/response/ResponseActivityPage').then(m => ({ default: m.ResponseActivityPage }))
);
const ResponseAuthorityPage = React.lazy(() =>
  import('@/pages/response/ResponseAuthorityPage').then(m => ({ default: m.ResponseAuthorityPage }))
);
const ResponseAuthorityEditorPage = React.lazy(() =>
  import('@/pages/response/ResponseAuthorityEditorPage').then(m => ({ default: m.ResponseAuthorityEditorPage }))
);
const ResponsePlaybooksPage = React.lazy(() =>
  import('@/pages/response/ResponsePlaybooksPage').then(m => ({ default: m.ResponsePlaybooksPage }))
);

// ── Search / Hunt ─────────────────────────────────────────────────────────────
const SearchHuntPage = React.lazy(() =>
  import('@/pages/search-hunt/SearchHuntPage').then(m => ({ default: m.SearchHuntPage }))
);

// ── EDR ───────────────────────────────────────────────────────────────────────
const EndpointTimelinePage = React.lazy(() =>
  import('@/pages/edr/EndpointTimelinePage').then(m => ({ default: m.EndpointTimelinePage }))
);
const FileQuarantinePage = React.lazy(() =>
  import('@/pages/edr/FileQuarantinePage').then(m => ({ default: m.FileQuarantinePage }))
);
const FimDashboardPage = React.lazy(() =>
  import('@/pages/edr/FimDashboardPage').then(m => ({ default: m.FimDashboardPage }))
);
const AgentPoliciesPage = React.lazy(() =>
  import('@/pages/edr/AgentPoliciesPage').then(m => ({ default: m.AgentPoliciesPage }))
);
const EndpointsListPage = React.lazy(() =>
  import('@/pages/edr/endpoints/EndpointsListPage').then(m => ({ default: m.EndpointsListPage }))
);

// ── UEBA ──────────────────────────────────────────────────────────────────────
const RiskDashboardPage = React.lazy(() =>
  import('@/pages/ueba/risk/RiskDashboardPage').then(m => ({ default: m.RiskDashboardPage }))
);
const EntityTimelineRoutePage = React.lazy(() =>
  import('@/pages/ueba/entity-timeline/EntityTimelineRoutePage').then(m => ({
    default: m.EntityTimelineRoutePage,
  }))
);

// ── Posture / New ─────────────────────────────────────────────────────────────
const CisBenchmarkPage = React.lazy(() =>
  import('@/pages/posture/cis-benchmark/CisBenchmarkPage').then(m => ({ default: m.CisBenchmarkPage }))
);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/login/tfa',
    element: <TfaPage />,
  },
  {
    path: '/access-denied',
    element: <AccessDeniedPage />,
  },
  // Public OIDC callback route — MUST NOT be behind AuthGuard
  // The backend redirects here with ?token=<jwt>&source=oidc after a successful
  // OIDC PKCE flow. This page stores the JWT and navigates to the app root.
  {
    path: '/oidc-callback',
    element: <OidcCallbackPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: 'mssp',
        element: (
          <AuthGuard>
            <MsspPortalOutlet />
          </AuthGuard>
        ),
        children: msspRouteChildren,
      },
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: (
          <AuthGuard>
            <CommandCenterPage />
          </AuthGuard>
        ),
      },
      {
        path: 'command',
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'queue',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <AnalystQueuePage />
          </AuthGuard>
        ),
      },
      {
        path: 'alerts',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <AlertsListPage />
          </AuthGuard>
        ),
      },
      {
        path: 'alerts/:id',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <AlertInvestigationPage />
          </AuthGuard>
        ),
      },
      // Canonical route: alerts/board
      {
        path: 'alerts/board',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <AlertSeverityBoardPage />
          </AuthGuard>
        ),
      },
      // Legacy redirect: alerts/severity → /alerts/board
      {
        path: 'alerts/severity',
        element: <Navigate to="/alerts/board" replace />,
      },
      // Canonical route: correlated-findings
      {
        path: 'correlated-findings',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <CorrelatedFindingsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'correlated-findings/:id',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <CorrelatedFindingDetailPage />
          </AuthGuard>
        ),
      },
      // Legacy redirects: offenses → /correlated-findings (preserve detail id)
      {
        path: 'offenses',
        element: <Navigate to="/correlated-findings" replace />,
      },
      {
        path: 'offenses/:id',
        element: <OffenseIdRedirect />,
      },
      {
        path: 'incidents',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <IncidentListPage />
          </AuthGuard>
        ),
      },
      {
        path: 'incidents/:id',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <IncidentDetailPage />
          </AuthGuard>
        ),
      },
      // Canonical route: search — Wave A2 A2-AUTH-01 (ALERT_QUEUE_AUTH)
      {
        path: 'search',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <SearchHuntPage />
          </AuthGuard>
        ),
      },
      // Legacy redirect: hunt → /search
      {
        path: 'hunt',
        element: <Navigate to="/search" replace />,
      },
      // EDR — Endpoint Timeline
      {
        path: 'edr/timeline/:agentId',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EndpointTimelinePage />
          </AuthGuard>
        ),
      },
      // EDR — File Quarantine
      {
        path: 'edr/quarantine',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <FileQuarantinePage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/quarantine',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <FileQuarantinePage />
          </AuthGuard>
        ),
      },
      // EDR — File Integrity Monitoring Dashboard
      {
        path: 'edr/fim',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <FimDashboardPage />
          </AuthGuard>
        ),
      },
      // EDR — Agent Policy Management (read: Analyst|SOC Manager|Admin; mutate gated in page)
      {
        path: 'edr/policies',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN', 'ROLE_SOC_MANAGER', 'ROLE_ANALYST']}>
            <AgentPoliciesPage />
          </AuthGuard>
        ),
      },
      // EDR — Endpoints list (agent selector, entry point for timeline)
      {
        path: 'edr/endpoints',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EndpointsListPage />
          </AuthGuard>
        ),
      },
      {
        path: 'investigations',
        element: (
          <AuthGuard>
            <InvestigationsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'investigations/:id',
        element: (
          <AuthGuard>
            <InvestigationDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'entities',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EntityInventoryPage />
          </AuthGuard>
        ),
      },
      {
        path: 'entities/inventory',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EntityInventoryPage />
          </AuthGuard>
        ),
      },
      {
        path: 'entities/:id/dossier',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EntityDossierPage />
          </AuthGuard>
        ),
      },
      // Wave A2 A2-ENT-01: legacy detail called non-existent /ha-entities/{id}; dossier is canonical
      {
        path: 'entities/:id',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <EntityIdToDossierRedirect />
          </AuthGuard>
        ),
      },
      {
        path: 'constellation',
        element: (
          <AuthGuard allowedRoles={[...ALERT_QUEUE_ROLES]}>
            <ThreatConstellationPage />
          </AuthGuard>
        ),
      },
      {
        path: 'intelligence',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <HiveIntelligencePage />
          </AuthGuard>
        ),
      },
      // Canonical route: detection-rules — list readable by Analyst (A3-DET-01)
      {
        path: 'detection-rules',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <DetectionRulesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'detection-rules/new',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <RuleEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'detection-rules/:id',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <RuleEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'detection-rules/:id/edit',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <RuleEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'detection-rules/:id/test',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <RuleTestPage />
          </AuthGuard>
        ),
      },
      // Legacy redirects: rules → /detection-rules
      {
        path: 'rules',
        element: <Navigate to="/detection-rules" replace />,
      },
      {
        path: 'rules/new',
        element: <Navigate to="/detection-rules/new" replace />,
      },
      {
        path: 'rules/:id/edit',
        element: <Navigate to="/detection-rules" replace />,
      },
      {
        path: 'rules/:id/test',
        element: <Navigate to="/detection-rules" replace />,
      },
      {
        path: 'response/library',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseLibraryPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/playbooks',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponsePlaybooksPage />
          </AuthGuard>
        ),
      },
      // Legacy — retained temporarily for regression comparison during Phase 7 migration.
      {
        path: 'response/playbooks-legacy',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <PlaybooksPage />
          </AuthGuard>
        ),
      },
      // NOTE: /new MUST be registered before /:id/edit to prevent "new" matching as an id
      {
        path: 'response/playbooks/new',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <PlaybookBuilderPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/playbooks/:id/edit',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <PlaybookBuilderPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/playbooks/:id',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <PlaybookDetailPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/activity',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseActivityPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/authority/policies/new',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseAuthorityEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/authority/policies/:id/edit',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseAuthorityEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/authority/delegations/new',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseAuthorityEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/authority/delegations/:id/edit',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseAuthorityEditorPage />
          </AuthGuard>
        ),
      },
      {
        path: 'response/authority',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ResponseAuthorityPage />
          </AuthGuard>
        ),
      },
       {
         path: 'posture/assets',
         element: (
           <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
             <AssetsPage />
           </AuthGuard>
         ),
      },
      {
        path: 'posture/identities',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <IdentitiesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/active-directory',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ActiveDirectoryPage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/exposure',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ExposurePage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/sensors',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <SensorGridPage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/vulnerabilities',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <VulnerabilitiesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/cis-benchmark',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <CisBenchmarkPage />
          </AuthGuard>
        ),
      },
      {
        path: 'posture/readiness',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ReadinessMatrixPage />
          </AuthGuard>
        ),
      },
      {
        path: 'compliance',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <CompliancePage />
          </AuthGuard>
        ),
      },
      {
        path: 'dashboards',
        element: (
          <AuthGuard>
            <DashboardGalleryPage />
          </AuthGuard>
        ),
      },
      {
        path: 'dashboards/studio',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <DashboardStudioPage />
          </AuthGuard>
        ),
      },
      {
        path: 'dashboards/:id',
        element: (
          <AuthGuard>
            <DashboardViewPage />
          </AuthGuard>
        ),
      },
      {
        path: 'dashboards/:id/edit',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <DashboardStudioPage />
          </AuthGuard>
        ),
      },
      {
        path: 'dashboards/metrics/builder',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <MetricsBuilderPage />
          </AuthGuard>
        ),
      },
      {
        path: 'reports/sitrep',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <SitrepReportPage />
          </AuthGuard>
        ),
      },
      {
        path: 'reports/incidents',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <IncidentReportsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'reports/after-action',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <AfterActionReportsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'reports/scheduled',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ScheduledReportsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'reports/templates',
        element: (
          <AuthGuard allowedRoles={['ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <ReportTemplatesPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <AdminUsersPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/tenants',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <AdminUsersPage initialView="tenants" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/tenants-old',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <AdminTenantsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/retention',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="retention" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/data-parsing',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <DataParsingPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/integrations',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <AdminIntegrationsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/connectors',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN', 'ROLE_SOC_MANAGER']}>
            <ConnectorSdkPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/notifications',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <AdminNotificationsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/connection-keys',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <Navigate to="/settings/api-keys" replace />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/audit',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="audit" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/audit-old',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="audit" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/settings',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="configuration" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/pipeline-signals',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <PipelineSignalsPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/settings-old',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="configuration" />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/rule-generation',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <RuleGenerationPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/rules/import',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN', 'ROLE_ANALYST']}>
            <RuleImportPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/rules/test',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN', 'ROLE_ANALYST']}>
            <RuleTestingPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/scim',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <ScimConfigPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/sso',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <SsoProvidersPage />
          </AuthGuard>
        ),
      },
      {
        path: 'admin/threat-intel',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <ThreatIntelAdminPage />
          </AuthGuard>
        ),
      },
      // ── Settings (S20-T01) ────────────────────────────────────────────────
      // Non-admin users are blocked by AuthGuard before any TanStack Query
      // fires, so /api/ha-admin/settings/* is never requested by non-admins
      // (Req 1.4, 13.4).
      {
        path: 'settings/system',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <GovernanceOperationsPage initialView="configuration" />
          </AuthGuard>
        ),
      },
      // ── Settings (S20-T02) ────────────────────────────────────────────────
      // Non-admin users are blocked by AuthGuard before any TanStack Query
      // fires, so /api/ha-admin/api-keys/* is never requested by non-admins
      // (Req 7.1, 13.4).
      {
        path: 'settings/api-keys',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN']}>
            <ApiKeyPage />
          </AuthGuard>
        ),
      },
      // ── Inputs (S20-T03) ──────────────────────────────────────────────────
      // Matches HaDataSourceController: ROLE_ADMIN | ROLE_ANALYST.
      {
        path: 'inputs/sources',
        element: (
          <AuthGuard allowedRoles={['ROLE_ADMIN', 'ROLE_ANALYST']}>
            <DataSourceStatusPage />
          </AuthGuard>
        ),
      },
      // ── UEBA — Risk Dashboard + Entity Timeline deep-link (Sprint 29) ────
      // Roles: Analyst | SOC Manager | Platform Administrator (JWT ROLE_*).
      {
        path: 'ueba/risk',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <RiskDashboardPage />
          </AuthGuard>
        ),
      },
      {
        path: 'ueba/entity-timeline',
        element: (
          <AuthGuard allowedRoles={['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']}>
            <EntityTimelineRoutePage />
          </AuthGuard>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
