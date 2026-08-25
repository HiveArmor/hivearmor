/**
 * ReadinessMatrixPage — POS-06 → Detection Coverage
 * Renamed per PD-08 resolution: "Detection Coverage" instead of "Readiness Matrix"
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, Loader2, X } from 'lucide-react';

import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { mitreService } from '@/services/mitre.service';
import type { TechniqueCoverageDTO } from '@/types/mitre.types';

export function ReadinessMatrixPage(): JSX.Element {
  const [selectedTechnique, setSelectedTechnique] = useState<TechniqueCoverageDTO | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const {
    data: coverage,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['mitreCoverage'],
    queryFn: mitreService.getCoverage,
  });

  const {
    data: rules,
    isLoading: isLoadingRules,
    isError: isRulesError,
  } = useQuery({
    queryKey: ['mitreRules', selectedTechnique?.technique],
    queryFn: () => {
      if (!selectedTechnique) {
        throw new Error('No technique selected');
      }
      return mitreService.getRulesByTechnique(selectedTechnique.technique);
    },
    enabled: !!selectedTechnique,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await mitreService.exportCoverage();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mitre-coverage.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fail closed — no console noise with customer/export context.
    } finally {
      setIsExporting(false);
    }
  };

  const getCellColor = (activeCount: number): string => {
    if (activeCount === 0) return 'var(--ha-border)';
    if (activeCount <= 2) return 'var(--ha-medium)';
    if (activeCount <= 5) return 'var(--ha-positive)';
    return 'var(--ha-primary)';
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <SiemPageHeader title="Detection Coverage" description="MITRE ATT&CK technique coverage" />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2 size={32} style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <SiemPageHeader title="Detection Coverage" description="MITRE ATT&CK technique coverage" />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
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
            <h2 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
              Error Loading Coverage
            </h2>
            <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
              {error instanceof Error ? error.message : 'An unknown error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!coverage || coverage.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <SiemPageHeader title="Detection Coverage" description="MITRE ATT&CK technique coverage" />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
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
            <h2 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
              No technique coverage projected
            </h2>
            <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
              No correlation rules currently report a MITRE technique id. This is an empty
              technique projection — not proof of full ATT&amp;CK coverage or ingest failure.
            </p>
          </div>
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
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="Detection Coverage"
        description="MITRE ATT&CK technique coverage"
        actions={
          <button
            onClick={handleExport}
            disabled={isExporting}
            style={{
              padding: '8px 16px',
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Download size={16} />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        }
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '24px',
          overflow: 'hidden',
        }}
      >
        {/* Heatmap Grid */}
        <div
          style={{
            flex: selectedTechnique ? '0 0 60%' : 1,
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '24px',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '8px',
            }}
          >
            {coverage.map((tech) => (
              <button
                key={tech.technique}
                onClick={() => setSelectedTechnique(tech)}
                style={{
                  padding: '12px',
                  background: getCellColor(tech.activeCount),
                  border:
                    selectedTechnique?.technique === tech.technique
                      ? '2px solid var(--ha-text-primary)'
                      : '1px solid var(--ha-border)',
                  borderRadius: 'var(--ha-radius-base)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    fontFamily: 'var(--ha-font-mono)',
                    color: 'var(--ha-text-primary)',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  {tech.technique}
                </div>
                <div
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    color: 'var(--ha-text-secondary)',
                  }}
                >
                  {tech.activeCount} / {tech.ruleCount}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Side Panel - Rule List */}
        {selectedTechnique && (
          <div
            style={{
              flex: '0 0 40%',
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: '24px',
              overflow: 'auto',
              position: 'relative',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 'var(--ha-text-md)',
                    fontWeight: 600,
                    color: 'var(--ha-text-primary)',
                    fontFamily: 'var(--ha-font-mono)',
                  }}
                >
                  {selectedTechnique.technique}
                </h3>
                <p style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
                  {selectedTechnique.activeCount} active, {selectedTechnique.ruleCount} total
                </p>
              </div>
              <button
                onClick={() => setSelectedTechnique(null)}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {isLoadingRules && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                <Loader2 size={32} style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }} />
              </div>
            )}

            {isRulesError && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                Failed to load rules
              </div>
            )}

            {rules && rules.length === 0 && (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                No rules found for this technique
              </div>
            )}

            {rules && rules.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      padding: '12px',
                      background: 'var(--ha-background)',
                      border: '1px solid var(--ha-border)',
                      borderRadius: 'var(--ha-radius-base)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--ha-text-sm)',
                        color: 'var(--ha-text-primary)',
                      }}
                    >
                      {rule.name}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--ha-radius-sm)',
                        fontSize: 'var(--ha-text-xs)',
                        fontWeight: 600,
                        background: rule.active
                          ? 'var(--ha-fill-low-muted)'
                          : 'var(--ha-fill-neutral-muted)',
                        color: rule.active ? 'var(--ha-positive)' : 'var(--ha-text-secondary)',
                      }}
                    >
                      {rule.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
