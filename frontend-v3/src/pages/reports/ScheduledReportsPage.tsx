/**
 * ScheduledReportsPage — Scheduled Reports Administration
 * Session: S35
 * Spec: .plan/frontend-v3-spec/screens/RPT-04-scheduled-reports.md
 *
 * Status: READY (UtmReport CRUD endpoints confirmed)
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus } from 'lucide-react';

import { deleteScheduledReport, fetchScheduledReports, pauseScheduledReport, resumeScheduledReport, runScheduledReport } from './reports.service';
import type { UtmReportDTO } from './reports.types';

import { CronHumanLabel } from '@/components/cron-human-label';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button';
import { HaDrawer } from '@/components/ha-drawer';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { useAuthStore } from '@/store/auth.store';

export function ScheduledReportsPage(): JSX.Element {
  const { hasRole, hasAnyRole } = useAuthStore();
  const isAdmin = hasRole('ROLE_ADMIN');
  const canView = hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']);
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formValues, setFormValues] = useState({
    name: '',
    reportType: 'SITREP',
    schedule: 'DAILY',
    recipients: '',
  });

  // Fetch scheduled reports
  const {
    data: reports,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['reports/scheduled'],
    queryFn: fetchScheduledReports,
    enabled: canView,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: deleteScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports/scheduled'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: pauseScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports/scheduled'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports/scheduled'] });
    },
  });

  const runMutation = useMutation({
    mutationFn: runScheduledReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports/scheduled'] });
    },
  });

  if (!canView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Scheduled Reports" />
        <div
          style={{
            flex: 1,
            background: 'var(--ha-background)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EmptyState
            icon={<Calendar size={48} />}
            title="Access Restricted"
            description="Scheduled Reports requires Analyst or higher. Required permission: Analyst."
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Scheduled Reports"
        badge={
          reports && (
            <span
              style={{
                background: 'var(--ha-surface-raised)',
                color: 'var(--ha-text-secondary)',
                fontSize: 'var(--ha-text-sm)',
                padding: '2px 8px',
                borderRadius: 'var(--ha-radius-sm)',
                border: '1px solid var(--ha-border)',
              }}
            >
              {reports.length}
            </span>
          )
        }
        actions={
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setCreateModalOpen(true)}
            isDisabled={!isAdmin}
            title={isAdmin ? undefined : 'Requires Administrator role'}
          >
            New Scheduled Report
          </HaButton>
        }
      />

      <div style={{ flex: 1, background: 'var(--ha-background)', padding: 24 }}>
        {isLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ha-text-secondary)' }}>
            Loading scheduled reports...
          </div>
        )}

        {isError && (
          <ErrorState
            title="Could not load scheduled reports"
            message="An error occurred while loading the scheduled reports list."
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && reports && reports.length === 0 && (
          <EmptyState
            icon={<Calendar size={48} />}
            title="No scheduled reports"
            description="Create a scheduled report to automate report delivery."
            action={
              isAdmin ? (
                <HaButton variant="primary" icon={<Plus size={16} />} onClick={() => setCreateModalOpen(true)}>
                  New Scheduled Report
                </HaButton>
              ) : undefined
            }
          />
        )}

        {!isLoading && !isError && reports && reports.length > 0 && (
          <div
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--ha-border)',
                    background: 'var(--ha-surface-raised)',
                  }}
                >
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                    }}
                  >
                    Report Name
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 120,
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 180,
                    }}
                  >
                    Schedule
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 120,
                    }}
                  >
                    Recipients
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 80,
                    }}
                  >
                    Format
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 100,
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: 'var(--ha-text-sm)',
                      fontWeight: 600,
                      color: 'var(--ha-text-primary)',
                      width: 160,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    isAdmin={isAdmin}
                    onDelete={() => deleteMutation.mutate(report.id)}
                    onPause={() => pauseMutation.mutate(report.id)}
                    onResume={() => resumeMutation.mutate(report.id)}
                    onRun={() => runMutation.mutate(report.id)}
                    isDeleting={deleteMutation.isPending}
                    isPausing={pauseMutation.isPending}
                    isResuming={resumeMutation.isPending}
                    isRunning={runMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Scheduled Report Drawer */}
      <HaDrawer
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setFormValues({
            name: '',
            reportType: 'SITREP',
            schedule: 'DAILY',
            recipients: '',
          });
        }}
        title="Schedule New Report"
        subtitle="Configure automated report delivery"
        width={520}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <HaButton
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                setFormValues({
                  name: '',
                  reportType: 'SITREP',
                  schedule: 'DAILY',
                  recipients: '',
                });
              }}
            >
              Cancel
            </HaButton>
            <HaButton
              variant="primary"
              isDisabled={!formValues.name.trim()}
              onClick={() => {
                // TODO: Implement when backend endpoint is ready
                alert('POST /api/ha-reports/schedule endpoint not yet implemented');
              }}
            >
              Schedule Report
            </HaButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
          {/* Engineering Notice */}
          <div
            style={{
              padding: 12,
              background: 'var(--ha-fill-intelligence-subtle)',
              border: '1px solid var(--ha-intelligence)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--ha-intelligence)' }}>Engineering Notice:</strong> Scheduled report creation requires backend endpoint POST /api/ha-reports/schedule
          </div>

          {/* Name */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontWeight: 500 }}>
              Report Name <span style={{ color: 'var(--ha-critical)' }}>*</span>
            </span>
            <input
              type="text"
              value={formValues.name}
              onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
              placeholder="e.g., Weekly Security Overview"
              required
              style={{
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                outline: 'none',
              }}
            />
          </label>

          {/* Report Type */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontWeight: 500 }}>
              Report Type
            </span>
            <select
              value={formValues.reportType}
              onChange={(e) => setFormValues({ ...formValues, reportType: e.target.value })}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                outline: 'none',
              }}
            >
              <option value="SITREP">Security SITREP</option>
              <option value="INCIDENT">Incident Report</option>
              <option value="AFTER_ACTION">After-Action Review</option>
            </select>
          </label>

          {/* Schedule */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontWeight: 500 }}>
              Schedule
            </span>
            <select
              value={formValues.schedule}
              onChange={(e) => setFormValues({ ...formValues, schedule: e.target.value })}
              style={{
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                outline: 'none',
              }}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>

          {/* Recipients */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontWeight: 500 }}>
              Recipients
            </span>
            <input
              type="text"
              value={formValues.recipients}
              onChange={(e) => setFormValues({ ...formValues, recipients: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
              style={{
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                background: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
              Comma-separated email addresses (optional)
            </span>
          </label>
        </div>
      </HaDrawer>
    </div>
  );
}

interface ReportRowProps {
  report: UtmReportDTO;
  isAdmin: boolean;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
  onRun: () => void;
  isDeleting: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isRunning: boolean;
}

function ReportRow({
  report,
  isAdmin,
  onDelete,
  onPause,
  onResume,
  onRun,
  isDeleting,
  isPausing,
  isResuming,
  isRunning,
}: ReportRowProps): JSX.Element {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <tr
        style={{
          borderBottom: '1px solid var(--ha-border)',
        }}
      >
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-primary)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 500 }}>{report.name}</span>
            {report.description && (
              <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
                {report.description}
              </span>
            )}
          </div>
        </td>
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 'var(--ha-radius-sm)',
              background: 'var(--ha-surface-raised)',
              color: 'var(--ha-text-secondary)',
              border: '1px solid var(--ha-border)',
            }}
          >
            {report.type}
          </span>
        </td>
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
          }}
        >
          <CronHumanLabel cron={report.schedule} />
        </td>
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
          title={report.recipients.slice(0, 10).join(', ') + (report.recipients.length > 10 ? ` +${report.recipients.length - 10} more` : '')}
        >
          {report.recipients.length} {report.recipients.length === 1 ? 'recipient' : 'recipients'}
        </td>
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            fontFamily: 'var(--ha-font-mono)',
          }}
        >
          {report.format}
        </td>
        <td
          style={{
            padding: '12px 16px',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 'var(--ha-radius-sm)',
              background: report.active ? 'var(--ha-fill-low-subtle)' : 'var(--ha-surface-raised)',
              color: report.active ? 'var(--ha-positive)' : 'var(--ha-text-secondary)',
              border: `1px solid ${report.active ? 'var(--ha-positive)' : 'var(--ha-border)'}`,
            }}
          >
            {report.active ? 'Active' : 'Paused'}
          </span>
        </td>
        <td
          style={{
            padding: '12px 16px',
            textAlign: 'right',
          }}
        >
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <HaButton
              variant="plain"
              isDisabled={!isAdmin || isPausing || isResuming}
              onClick={report.active ? onPause : onResume}
              title={isAdmin ? (report.active ? 'Pause' : 'Resume') : 'Requires Administrator role'}
            >
              {report.active ? 'Pause' : 'Resume'}
            </HaButton>
            <HaButton
              variant="plain"
              isDisabled={!isAdmin || isRunning}
              onClick={onRun}
              title={isAdmin ? 'Run Now' : 'Requires Administrator role'}
            >
              Run Now
            </HaButton>
            <HaButton
              variant="danger"
              isDisabled={!isAdmin || isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
              title={isAdmin ? 'Delete' : 'Requires Administrator role'}
            >
              Delete
            </HaButton>
          </div>
        </td>
      </tr>
      {showDeleteConfirm && (
        <tr>
          <td
            colSpan={7}
            style={{
              padding: '12px 16px',
              background: 'var(--ha-fill-critical-subtle)',
              borderTop: '1px solid var(--ha-critical)',
              borderBottom: '1px solid var(--ha-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--ha-critical)', fontSize: 'var(--ha-text-base)' }}>⚠</span>
                <span style={{ color: 'var(--ha-text-primary)', fontSize: 'var(--ha-text-sm)' }}>
                  Permanently delete &ldquo;{report.name}&rdquo;? This cannot be undone.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <HaButton variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </HaButton>
                <HaButton
                  variant="danger"
                  onClick={() => {
                    onDelete();
                    setShowDeleteConfirm(false);
                  }}
                  isLoading={isDeleting}
                >
                  Delete
                </HaButton>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
