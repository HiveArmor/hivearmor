/**
 * AfterActionReportsPage — After-Action Review (AAR)
 * Session: S44
 * Backend: POST /api/ha-reports, GET /api/ha-reports?repType=AFTER_ACTION
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { FileText, Plus } from 'lucide-react';

import { GenerateAfterActionModal } from './components/GenerateAfterActionModal';
import { createReport, fetchReportsByType } from './reports.service';
import type { CreateReportDTO, ReportDTO } from './reports.types';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';



export function AfterActionReportsPage(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: reports, isLoading, isError } = useQuery({
    queryKey: ['reports', 'AFTER_ACTION'],
    queryFn: () => fetchReportsByType('AFTER_ACTION'),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateReportDTO) => createReport(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'AFTER_ACTION'] });
      setIsModalOpen(false);
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
      headerName: 'Linked Incident',
      field: 'reportSectionId',
      flex: 1,
      sortable: true,
      valueFormatter: (params) => (params.value ? `#${params.value}` : '—'),
    },
    {
      headerName: 'Generated',
      field: 'creationDate',
      flex: 1,
      sortable: true,
      valueFormatter: (params) => {
        if (!params.value) return '—';
        return new Date(params.value).toLocaleString();
      },
    },
    {
      headerName: 'Description',
      field: 'repDescription',
      flex: 2,
      sortable: false,
      valueFormatter: (params) => params.value ?? '—',
    },
    {
      headerName: 'Download',
      field: 'repUrl',
      flex: 1,
      sortable: false,
      cellRenderer: (params: { value: string | null }) => {
        if (!params.value) return '—';
        return (
          <a
            href={params.value}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--ha-primary)', textDecoration: 'underline' }}
          >
            Download
          </a>
        );
      },
    },
  ];

  const handleGenerateReport = (values: { name: string; description: string; incidentId: string }) => {
    const dto: CreateReportDTO = {
      repName: values.name,
      repDescription: values.description,
      repType: 'AFTER_ACTION',
      reportSectionId: parseInt(values.incidentId, 10),
    };
    createMutation.mutate(dto);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="After-Action Review"
        actions={
          <HaButton variant="primary" icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
            New After-Action Report
          </HaButton>
        }
      />

      <div style={{ flex: 1, background: 'var(--ha-background)', padding: '16px' }}>
        {isLoading && <LoadingState message="Loading after-action reports..." />}

        {isError && !isLoading && (
          <ErrorState
            title="Could not load after-action reports"
            message="An error occurred while loading the reports."
          />
        )}

        {!isError && !isLoading && (!reports || reports.length === 0) && (
          <EmptyState
            icon={<FileText size={48} />}
            title="No after-action reports generated yet"
            description="Click 'New After-Action Report' to create your first report."
          />
        )}

        {!isError && !isLoading && reports && reports.length > 0 && (
          <div style={{ height: 'calc(100vh - 160px)' }}>
            <SiemDataGrid
              columnDefs={columnDefs}
              rowData={reports}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              paginationPageSize={50}
            />
          </div>
        )}
      </div>

      <GenerateAfterActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={handleGenerateReport}
        isGenerating={createMutation.isPending}
      />
    </div>
  );
}
