/**
 * DataParsingPage.tsx — Data Parsing / Log Filters management (ADM-05)
 * SiemDataGrid + Monaco Editor drawer for YAML parser rules
 */

import { lazy, Suspense, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { FileCode, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { apiClient } from '@/lib/apiClient';
import { defineHiveArmorMonacoTheme } from '@/lib/monacoTheme';
import { useThemeStore } from '@/store/theme.store';

// Lazy-load Monaco Editor
const Editor = lazy(() => import('@monaco-editor/react'));

interface ParserRuleDTO {
  id: string;
  name: string;
  dataType: string;
  status: 'active' | 'inactive' | 'error';
  lastMatchedCount: number;
  yamlBody: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ParserFormData {
  name: string;
  dataType: string;
  status: 'active' | 'inactive' | 'error';
  yamlBody: string;
}

async function getParsers(): Promise<ParserRuleDTO[]> {
  return apiClient.get<ParserRuleDTO[]>('/ha-parsers');
}

async function createParser(data: Omit<ParserRuleDTO, 'id' | 'createdAt' | 'updatedAt'>): Promise<ParserRuleDTO> {
  return apiClient.post<ParserRuleDTO>('/ha-parsers', data);
}

async function updateParser(id: string, data: Partial<ParserRuleDTO>): Promise<ParserRuleDTO> {
  return apiClient.put<ParserRuleDTO>(`/ha-parsers/${id}`, data);
}

async function deleteParser(id: string): Promise<void> {
  return apiClient.delete<void>(`/ha-parsers/${id}`);
}

export function DataParsingPage(): JSX.Element {
  const queryClient = useQueryClient();
  const theme = useThemeStore((state) => state.theme);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingParser, setEditingParser] = useState<ParserRuleDTO | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [parserToDelete, setParserToDelete] = useState<string | null>(null);
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const [formData, setFormData] = useState<ParserFormData>({
    name: '',
    dataType: '',
    status: 'active',
    yamlBody: '# YAML parser definition\nfilter:\n  source: \n  type: \n',
  });

  const { data: parsers, isLoading, isError, error } = useQuery({
    queryKey: ['parsers'],
    queryFn: getParsers,
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<ParserRuleDTO, 'id' | 'createdAt' | 'updatedAt'>) => createParser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsers'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ParserRuleDTO> }) => updateParser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsers'] });
      setDrawerOpen(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parsers'] });
      setDeleteConfirmOpen(false);
      setParserToDelete(null);
    },
  });

  const resetForm = (): void => {
    setFormData({
      name: '',
      dataType: '',
      status: 'active',
      yamlBody: '# YAML parser definition\nfilter:\n  source: \n  type: \n',
    });
    setEditingParser(null);
  };

  const handleOpenDrawer = (parser?: ParserRuleDTO): void => {
    if (parser) {
      setEditingParser(parser);
      setFormData({
        name: parser.name,
        dataType: parser.dataType,
        status: parser.status,
        yamlBody: parser.yamlBody,
      });
    } else {
      resetForm();
    }
    setDrawerOpen(true);
  };

  const handleCloseDrawer = (): void => {
    setDrawerOpen(false);
    resetForm();
  };

  const handleSave = (): void => {
    if (editingParser) {
      updateMutation.mutate({
        id: editingParser.id,
        data: { ...formData, lastMatchedCount: editingParser.lastMatchedCount },
      });
    } else {
      createMutation.mutate({ ...formData, lastMatchedCount: 0 });
    }
  };

  const handleDeleteClick = (id: string): void => {
    setParserToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = (): void => {
    if (parserToDelete) {
      deleteMutation.mutate(parserToDelete);
    }
  };

  const handleMonacoMount = (monaco: typeof import('monaco-editor')): void => {
    defineHiveArmorMonacoTheme(monaco);
    setMonacoLoaded(true);
  };

  const StatusCell = (params: { value: unknown }): JSX.Element => {
    const value = params.value as 'active' | 'inactive' | 'error';
    const colors: Record<string, string> = {
      active: 'var(--ha-positive)',
      inactive: 'var(--ha-text-secondary)',
      error: 'var(--ha-critical)',
    };

    return (
      <span
        style={{
          color: colors[value] ?? 'var(--ha-text-secondary)',
          textTransform: 'capitalize',
        }}
      >
        {value}
      </span>
    );
  };

  const LastMatchedCell = (params: { value: unknown }): JSX.Element => {
    const value = params.value as number;
    return (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </span>
    );
  };

  const ActionsCell = (params: { data: unknown }): JSX.Element => {
    const data = params.data as ParserRuleDTO;
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <HaButton variant="secondary" size="sm" onClick={() => handleOpenDrawer(data)}>
          Edit
        </HaButton>
        <button
          onClick={() => handleDeleteClick(data.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ha-critical)',
          }}
          aria-label="Delete parser"
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  };

  const columnDefs: ColDef[] = [
    {
      field: 'name',
      headerName: 'Parser Name',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'dataType',
      headerName: 'Data Type',
      width: 150,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      cellRenderer: StatusCell,
    },
    {
      field: 'lastMatchedCount',
      headerName: 'Last Matched',
      width: 140,
      cellRenderer: LastMatchedCell,
    },
    {
      field: 'updatedAt',
      headerName: 'Last Updated',
      width: 160,
      valueFormatter: (params) =>
        params.value ? new Date(params.value as string).toLocaleString() : '—',
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 150,
      pinned: 'right',
      sortable: false,
      resizable: false,
      cellRenderer: ActionsCell,
    },
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Data Parsing" />
        <LoadingState rows={10} />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader title="Data Parsing" />
        <div style={{ padding: 24 }}>
          <ErrorState
            title="Failed to load parser rules"
            message={error instanceof Error ? error.message : 'Unknown error'}
          />
        </div>
      </div>
    );
  }

  const isEmpty = !parsers || parsers.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Data Parsing"
        actions={
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => handleOpenDrawer()}
          >
            Add Parser
          </HaButton>
        }
      />

      <div style={{ flex: 1, padding: 24 }}>
        {isEmpty ? (
          <EmptyState
            icon={<FileCode size={48} />}
            title="No parser rules configured"
            description="Create parser rules to extract and normalize data from log sources."
            action={
              <HaButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => handleOpenDrawer()}
              >
                Add Parser
              </HaButton>
            }
          />
        ) : (
          <div style={{ height: '100%' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={parsers}
              height="100%"
              getRowId={(params) => (params.data as ParserRuleDTO).id}
            />
          </div>
        )}
      </div>

      <HaDrawer
        isOpen={drawerOpen}
        onClose={handleCloseDrawer}
        title={editingParser ? 'Edit Parser Rule' : 'Add Parser Rule'}
        width={720}
        footer={
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <HaButton variant="secondary" onClick={handleCloseDrawer}>
              Cancel
            </HaButton>
            <HaButton
              variant="primary"
              onClick={handleSave}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingParser ? 'Save' : 'Create'}
            </HaButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Parser Name
            </label>
            <HaTextInput
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="e.g., Windows Security Events"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Data Type
            </label>
            <HaTextInput
              value={formData.dataType}
              onChange={(value) => setFormData({ ...formData, dataType: value })}
              placeholder="e.g., windows-logs"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as ParserFormData['status'] })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 'var(--ha-text-base)',
                color: 'var(--ha-text-primary)',
                backgroundColor: 'var(--ha-surface-raised)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: 8,
              }}
            >
              YAML Definition
            </label>
            <div
              style={{
                flex: 1,
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                overflow: 'hidden',
                minHeight: '400px',
              }}
            >
              <Suspense
                fallback={
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '400px',
                      color: 'var(--ha-text-secondary)',
                    }}
                  >
                    Loading editor...
                  </div>
                }
              >
                <Editor
                  height="400px"
                  language="yaml"
                  theme={monacoLoaded ? `hivearmor-${theme}` : theme === 'dark' ? 'vs-dark' : 'vs'}
                  value={formData.yamlBody}
                  onChange={(value) => setFormData({ ...formData, yamlBody: value || '' })}
                  beforeMount={handleMonacoMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </HaDrawer>

      <HaConfirmationModal
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Parser Rule"
        message="Are you sure you want to delete this parser rule? Log data matching this rule will no longer be parsed."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
