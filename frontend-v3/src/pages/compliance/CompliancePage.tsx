import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { AlertCircle, ClipboardCheck, Download, Loader2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { postureService } from '@/services/posture.service';
import type { ComplianceFindingDTO } from '@/types/compliance.types';

/**
 * CompliancePage — Compliance framework monitoring (POS-07)
 * Now wired to live backend endpoints: /api/ha-posture/score, /api/ha-posture/frameworks
 */
export function CompliancePage(): JSX.Element {
  const {
    data: postureScore,
    isLoading: isScoreLoading,
    isError: isScoreError,
  } = useQuery({
    queryKey: ['postureScore'],
    queryFn: postureService.getScore,
  });

  const {
    data: frameworks,
    isLoading: isFrameworksLoading,
    isError: isFrameworksError,
    error: frameworksError,
  } = useQuery({
    queryKey: ['postureFrameworks'],
    queryFn: postureService.getFrameworks,
  });

  const [selectedFramework, setSelectedFramework] = useState<string>('');

  const currentFramework = frameworks?.find((f) => f.id === selectedFramework);

  // Auto-select first framework when data loads
  if (frameworks && frameworks.length > 0 && !selectedFramework) {
    setSelectedFramework(frameworks[0].id);
  }

  // Column definitions per POS-07 spec §9.2
  const findingColumnDefs: ColDef<ComplianceFindingDTO>[] = [
    {
      field: 'controlId',
      headerName: 'Control ID',
      width: 120,
      cellStyle: {
        fontFamily: 'var(--ha-font-mono)',
        fontWeight: 600,
      },
    },
    {
      field: 'controlName',
      headerName: 'Control Name',
      width: 280,
      minWidth: 200,
      flex: 1,
      cellStyle: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      cellRenderer: (params: { value: string }) => {
        const status = params.value;
        const statusMap: Record<
          string,
          { label: string; bg: string; color: string }
        > = {
          compliant: {
            label: 'Compliant',
            bg: 'var(--ha-fill-low-muted)',
            color: 'var(--ha-positive)',
          },
          non_compliant: {
            label: 'Non-Compliant',
            bg: 'var(--ha-fill-critical-muted)',
            color: 'var(--ha-critical)',
          },
          in_progress: {
            label: 'In Progress',
            bg: 'var(--ha-fill-high-muted)',
            color: 'var(--ha-high)',
          },
          not_applicable: {
            label: 'N/A',
            bg: 'transparent',
            color: 'var(--ha-text-secondary)',
          },
        };

        const style = statusMap[status] ?? statusMap.not_applicable;

        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '2px',
              fontSize: 'var(--ha-text-xs)',
              backgroundColor: style.bg,
              color: style.color,
            }}
          >
            {style.label}
          </span>
        );
      },
    },
    {
      field: 'evidenceCount',
      headerName: 'Evidence',
      width: 80,
      cellStyle: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
    },
    {
      field: 'lastChecked',
      headerName: 'Last Checked',
      width: 160,
      cellStyle: {
        fontFamily: 'var(--ha-font-mono)',
        fontVariantNumeric: 'tabular-nums',
      },
      valueFormatter: (params) => {
        if (!params.value) return '—';
        const date = new Date(params.value as string);
        return date.toLocaleString();
      },
    },
  ];

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'var(--ha-positive)';
    if (score >= 60) return 'var(--ha-high)';
    return 'var(--ha-critical)';
  };

  if (isScoreLoading || isFrameworksLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Loader2 size={32} style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (isScoreError || isFrameworksError) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '600px',
          }}
        >
          <AlertCircle size={48} style={{ color: 'var(--ha-critical)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            Error Loading Posture Data
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            {frameworksError instanceof Error ? frameworksError.message : 'An unknown error occurred'}
          </p>
        </div>
      </div>
    );
  }

  if (!frameworks || frameworks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '600px',
          }}
        >
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            No Compliance Frameworks
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            No compliance frameworks are configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--ha-background)',
      }}
    >
      {/* Overall Posture Score Banner */}
      {postureScore && (
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--ha-surface-raised)',
            borderBottom: '1px solid var(--ha-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                Overall Score
              </span>
              <div
                style={{
                  fontSize: 'var(--ha-text-2xl)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: getScoreColor(postureScore.overallScore),
                }}
              >
                {postureScore.overallScore.toFixed(1)}%
              </div>
            </div>
            <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
              {postureScore.controlsPassed} / {postureScore.controlsTotal} controls passed
            </div>
            <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
              {postureScore.totalFrameworks} frameworks
            </div>
            {postureScore.trend && (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--ha-radius-sm)',
                  fontSize: 'var(--ha-text-xs)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  background:
                    postureScore.trend === 'improving'
                      ? 'var(--ha-fill-low-muted)'
                      : postureScore.trend === 'declining'
                      ? 'var(--ha-fill-critical-muted)'
                      : 'var(--ha-fill-neutral-muted)',
                  color:
                    postureScore.trend === 'improving'
                      ? 'var(--ha-positive)'
                      : postureScore.trend === 'declining'
                      ? 'var(--ha-critical)'
                      : 'var(--ha-text-secondary)',
                }}
              >
                {postureScore.trend}
              </span>
            )}
          </div>
          {postureScore.lastAssessed && (
            <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
              Last assessed: {new Date(postureScore.lastAssessed).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Page content with sidebar */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Framework selector sidebar */}
        <div
          style={{
            width: '240px',
            backgroundColor: 'var(--ha-surface-primary)',
            borderRight: '1px solid var(--ha-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--ha-border)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontWeight: 600,
            }}
          >
            Frameworks
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {frameworks?.map((framework) => (
              <button
                key={framework.id}
                type="button"
                onClick={() => setSelectedFramework(framework.id)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor:
                    selectedFramework === framework.id
                      ? 'var(--ha-surface-raised)'
                      : 'transparent',
                  borderLeft:
                    selectedFramework === framework.id
                      ? '2px solid var(--ha-primary)'
                      : '2px solid transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--ha-text-sm)',
                    fontWeight: 600,
                    color: 'var(--ha-text-primary)',
                  }}
                >
                  {framework.name}
                </span>
                <span
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    fontFamily: 'var(--ha-font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    color: getScoreColor(framework.overallScore),
                  }}
                >
                  {framework.overallScore.toFixed(0)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main content panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Compliance score header */}
          <div
            style={{
              height: '80px',
              padding: '16px 24px',
              borderBottom: '1px solid var(--ha-border)',
              backgroundColor: 'var(--ha-surface-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 'var(--ha-text-xl)',
                  fontWeight: 600,
                  color: 'var(--ha-text-primary)',
                  margin: 0,
                  marginBottom: '4px',
                }}
              >
                {currentFramework?.name ?? 'Select Framework'}
              </h2>
              <div
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                0 / {currentFramework?.controlCount ?? 0} controls compliant
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 'var(--ha-text-2xl)',
                  fontFamily: 'var(--ha-font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: getScoreColor(currentFramework?.overallScore ?? 0),
                  marginBottom: '4px',
                }}
              >
                {currentFramework?.overallScore.toFixed(0) ?? 0}%
              </div>
              <div
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                compliant
              </div>
            </div>
          </div>

          {/* Findings grid */}
          <div style={{ flex: 1, padding: '16px' }}>
            <SiemDataGrid
              columnDefs={findingColumnDefs}
              rowData={[]}
              rowModelType="clientSide"
              height="100%"
              noRowsOverlayComponent={() => (
                <EmptyState
                  icon={<ClipboardCheck size={48} />}
                  title="No findings for this framework"
                  description="Assessment data is not yet available."
                />
              )}
            />
          </div>

          {/* Export bar */}
          <div
            style={{
              height: '40px',
              padding: '0 16px',
              borderTop: '1px solid var(--ha-border)',
              backgroundColor: 'var(--ha-surface-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="MITRE export blocked pending security remediation (GAP-SEC-10). /api/mitre/coverage/export has no authorization gate."
              style={{
                padding: '6px 12px',
                fontSize: 'var(--ha-text-sm)',
                backgroundColor: 'var(--ha-surface-raised)',
                color: 'var(--ha-text-secondary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                cursor: 'not-allowed',
                opacity: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} />
              Export MITRE Coverage
            </button>

            <span
              style={{
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-high)',
              }}
            >
              Blocked (GAP-SEC-10)
            </span>

            <button
              type="button"
              disabled
              title="No findings to export"
              style={{
                padding: '6px 12px',
                fontSize: 'var(--ha-text-sm)',
                backgroundColor: 'var(--ha-surface-raised)',
                color: 'var(--ha-text-secondary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                cursor: 'not-allowed',
                opacity: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={14} />
              Export Findings CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
