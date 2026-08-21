/**
 * ReportTemplatesPage — Report Template Builder
 * Session: S44
 * Backend: POST /api/ha-reports, GET /api/ha-reports?repType=TEMPLATE
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { FileText, Plus, Trash2 } from 'lucide-react';

import { CreateTemplateModal } from './components/CreateTemplateModal';
import { createReport, deleteReport, fetchReportsByType } from './reports.service';
import type { CreateReportDTO, ReportDTO } from './reports.types';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';



export function ReportTemplatesPage(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: templates, isLoading, isError } = useQuery({
    queryKey: ['reports', 'TEMPLATE'],
    queryFn: () => fetchReportsByType('TEMPLATE'),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateReportDTO) => createReport(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'TEMPLATE'] });
      setIsModalOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'TEMPLATE'] });
    },
  });

  const columnDefs: ColDef<ReportDTO>[] = [
    {
      headerName: 'Name',
      field: 'repName',
      flex: 2,
      sortable: true,
      filter: true,
    },
    {
      headerName: 'Report Type',
      field: 'repModule',
      flex: 1,
      sortable: true,
      valueFormatter: (params) => params.value ?? 'General',
    },
    {
      headerName: 'Created',
      field: 'creationDate',
      flex: 1,
      sortable: true,
      valueFormatter: (params) => {
        if (!params.value) return '—';
        return new Date(params.value).toLocaleDateString();
      },
    },
    {
      headerName: 'Last Modified',
      field: 'modificationDate',
      flex: 1,
      sortable: true,
      valueFormatter: (params) => {
        if (!params.value) return '—';
        return new Date(params.value).toLocaleDateString();
      },
    },
    {
      headerName: 'Actions',
      field: 'id',
      flex: 1,
      sortable: false,
      cellRenderer: (params: { value: number }) => {
        return (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => deleteMutation.mutate(params.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ha-critical)',
                cursor: 'pointer',
                padding: '4px',
              }}
              title="Delete template"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      },
    },
  ];

  const handleCreateTemplate = (values: { name: string; description: string; reportType: string }) => {
    const dto: CreateReportDTO = {
      repName: values.name,
      repDescription: values.description,
      repType: 'TEMPLATE',
      repModule: values.reportType,
    };
    createMutation.mutate(dto);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Report Templates"
        actions={
          <HaButton variant="primary" icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
            New Template
          </HaButton>
        }
      />

      <div style={{ flex: 1, background: 'var(--ha-background)', padding: '16px' }}>
        {isLoading && <LoadingState message="Loading report templates..." />}

        {isError && !isLoading && (
          <ErrorState
            title="Could not load report templates"
            message="An error occurred while loading the templates."
          />
        )}

        {!isError && !isLoading && (!templates || templates.length === 0) && (
          <EmptyState
            icon={<FileText size={48} />}
            title="No report templates"
            description="Create one to generate reports faster."
          />
        )}

        {!isError && !isLoading && templates && templates.length > 0 && (
          <div style={{ height: 'calc(100vh - 160px)' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={templates}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              paginationPageSize={50}
            />
          </div>
        )}
      </div>

      <CreateTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateTemplate}
        isCreating={createMutation.isPending}
      />
    </div>
  );
}
