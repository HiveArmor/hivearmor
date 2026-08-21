/**
 * MetricsBuilderPage — ADMIN-only visualization builder
 * Session S33 — Dashboard Studio Metric Builder (DSH-04)
 */

import type React from 'react';
import { useState } from 'react';

import Editor from '@monaco-editor/react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { MetricWidgetConfig } from './studio/renderers/MetricRenderer';
import { MetricRenderer } from './studio/renderers/MetricRenderer';

import { HaChart } from '@/components/ha-chart';
import { SiemDataGrid } from '@/components/siem-data-grid';

export function MetricsBuilderPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [vizName, setVizName] = useState<string>('Untitled Metric');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [queryJson, setQueryJson] = useState<string>(DEFAULT_QUERY);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<{ rowCount?: number; durationMs?: number } | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Aggregation builder state
  const [metricType, setMetricType] = useState<string>('count');
  const [field, setField] = useState<string>('');
  const [timeBucket, setTimeBucket] = useState<string>('auto');

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: { name: string; type: string; query: string }) => {
      const response = await fetch('/api/ha-visualizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token') || ''}`,
        },
        body: JSON.stringify({
          name: payload.name,
          type: payload.type.toUpperCase(),
          query: payload.query,
          description: null,
          chartConfig: '{}',
          width: 6,
          height: 4,
          posX: 0,
          posY: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: (saved: { id: number }) => {
      setHasUnsavedChanges(false);
      navigate(`/dashboards/metrics/${saved.id}`);
    },
  });

  const handleRunPreview = async (): Promise<void> => {
    setIsRunning(true);
    try {
      // GAP-SEC-06: POST /api/ha-visualizations/run has no @PreAuthorize
      // Frontend restricts this page to ROLE_ADMIN, but backend does not enforce role on this endpoint
      const response = await fetch('/api/ha-visualizations/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token') || ''}`,
        },
        body: JSON.stringify({
          query: queryJson,
          chartType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Preview failed: ${response.statusText}`);
      }

      const data = await response.json();
      setPreviewData(data);
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewData(null);
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    saveMutation.mutate({
      name: vizName,
      type: chartType,
      query: queryJson,
    });
  };

  const handleDiscard = (): void => {
    if (confirm('Discard changes?')) {
      window.location.href = '/dashboards';
    }
  };

  const handleQueryChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setQueryJson(value);
      setHasUnsavedChanges(true);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--ha-background)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: '44px',
          backgroundColor: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 16px',
        }}
      >
        <input
          type="text"
          value={vizName}
          onChange={(e) => {
            setVizName(e.target.value);
            setHasUnsavedChanges(true);
          }}
          placeholder="Untitled Metric"
          style={{
            fontSize: 'var(--ha-text-lg)',
            color: 'var(--ha-text-primary)',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '4px 8px',
            flex: 1,
            maxWidth: '300px',
          }}
          onFocus={(e) => {
            e.target.style.border = '1px solid var(--ha-primary)';
            e.target.style.borderRadius = '4px';
          }}
          onBlur={(e) => {
            e.target.style.border = 'none';
          }}
        />

        <select
          value={chartType}
          onChange={(e) => {
            setChartType(e.target.value as ChartType);
            setHasUnsavedChanges(true);
          }}
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-primary)',
            backgroundColor: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            padding: '4px 8px',
          }}
        >
          <option value="line">Line</option>
          <option value="bar">Bar</option>
          <option value="area">Area</option>
          <option value="pie">Pie</option>
          <option value="metric">Metric</option>
          <option value="table">Table</option>
        </select>

        <button
          onClick={handleRunPreview}
          disabled={isRunning}
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-primary)',
            backgroundColor: 'var(--ha-primary)',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 16px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.6 : 1,
          }}
          title="Ctrl+Enter / Cmd+Enter"
        >
          {isRunning ? 'Running…' : 'Run Preview'}
        </button>

        <button
          onClick={handleSave}
          disabled={!vizName.trim() || saveMutation.isPending}
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-foreground-on-action)',
            backgroundColor: 'var(--ha-positive)',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 16px',
            cursor: !vizName.trim() || saveMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: !vizName.trim() || saveMutation.isPending ? 0.6 : 1,
          }}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>

        {hasUnsavedChanges && (
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--ha-high)',
            }}
            title="Unsaved changes"
          />
        )}

        <button
          onClick={handleDiscard}
          style={{
            fontSize: 'var(--ha-text-base)',
            color: 'var(--ha-text-secondary)',
            backgroundColor: 'transparent',
            border: '1px solid var(--ha-border)',
            borderRadius: '4px',
            padding: '6px 16px',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          Discard
        </button>
      </div>

      {/* Main content: split panes */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left pane: Aggregation builder + Monaco editor */}
        <div
          style={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--ha-border)',
          }}
        >
          {/* Aggregation builder */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--ha-surface-primary)',
              borderBottom: '1px solid var(--ha-border)',
            }}
          >
            <h3
              style={{
                fontSize: 'var(--ha-text-md)',
                color: 'var(--ha-text-primary)',
                marginBottom: '12px',
                fontWeight: 'var(--ha-weight-medium)',
              }}
            >
              Aggregation Builder
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Metric</span>
                <select
                  value={metricType}
                  onChange={(e) => setMetricType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="count">Count</option>
                  <option value="sum">Sum</option>
                  <option value="average">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="cardinality">Cardinality</option>
                  <option value="percentile">Percentile (95th)</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Field</span>
                <input
                  type="text"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  placeholder="Select field..."
                  disabled={metricType === 'count'}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Time bucket</span>
                <select
                  value={timeBucket}
                  onChange={(e) => setTimeBucket(e.target.value)}
                  style={inputStyle}
                >
                  <option value="auto">Auto</option>
                  <option value="1m">1 minute</option>
                  <option value="5m">5 minutes</option>
                  <option value="15m">15 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="6h">6 hours</option>
                  <option value="1d">1 day</option>
                </select>
              </label>
            </div>
          </div>

          {/* Monaco query editor */}
          <div style={{ flex: 1, minHeight: '400px' }}>
            <Editor
              height="100%"
              language="json"
              theme="vs-dark"
              value={queryJson}
              onChange={handleQueryChange}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                fontSize: 13,
                tabSize: 2,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Right pane: Live preview */}
        <div
          style={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--ha-surface-primary)',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid var(--ha-border)',
            }}
          >
            <h3
              style={{
                fontSize: 'var(--ha-text-md)',
                color: 'var(--ha-text-primary)',
                fontWeight: 'var(--ha-weight-medium)',
              }}
            >
              Live Preview
            </h3>
          </div>

          <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
            {isRunning && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                Running…
              </div>
            )}

            {!isRunning && !previewData && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--ha-text-secondary)',
                  fontSize: 'var(--ha-text-sm)',
                }}
              >
                Run preview to see results
              </div>
            )}

            {!isRunning && previewData !== null && renderPreview(chartType, previewData)}
          </div>

          {/* Preview metadata footer */}
          {!isRunning && previewData !== null && (
            <div
              style={{
                height: '24px',
                padding: '0 16px',
                backgroundColor: 'var(--ha-surface-raised)',
                borderTop: '1px solid var(--ha-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                fontSize: 'var(--ha-text-xs)',
                color: 'var(--ha-text-secondary)',
                fontFamily: 'var(--ha-font-mono)',
              }}
            >
              <span>Rows: {previewData?.rowCount ?? 0}</span>
              <span>Query time: {previewData?.durationMs ?? 0}ms</span>
              <span>Last run: just now</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'metric' | 'table';

const DEFAULT_QUERY = `{
  "metric": "count",
  "field": null,
  "groupBy": [],
  "timeBucket": "auto"
}`;

const inputStyle: React.CSSProperties = {
  fontSize: 'var(--ha-text-base)',
  color: 'var(--ha-text-primary)',
  backgroundColor: 'var(--ha-surface-raised)',
  border: '1px solid var(--ha-border)',
  borderRadius: '4px',
  padding: '6px 8px',
  outline: 'none',
};

function renderPreview(chartType: ChartType, data: unknown): React.JSX.Element {
  if (chartType === 'metric') {
    const metricConfig: MetricWidgetConfig = {
      visualizationId: 0,
      showTrend: true,
    };
    return <MetricRenderer data={data} config={metricConfig} />;
  }

  if (chartType === 'table') {
    return (
      <SiemDataGrid
        columnDefs={[
          { field: 'key', headerName: 'Key' },
          { field: 'value', headerName: 'Value' },
        ]}
        rowData={[]}
        height="100%"
      />
    );
  }

  // Chart types
  return (
    <HaChart
      option={{
        backgroundColor: 'transparent',
        xAxis: { type: 'category', data: [] },
        yAxis: { type: 'value' },
        series: [{ type: chartType === 'area' ? 'line' : chartType, data: [] }],
      }}
      height="100%"
      ariaLabel="Metrics builder chart preview"
    />
  );
}
