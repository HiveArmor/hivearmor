/**
 * SitrepReportPage — Security Situation Report (SITREP)
 * Session: S44
 * Backend: POST /api/ha-reports, GET /api/ha-reports?repType=SITREP
 */

import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { FileText, Plus } from 'lucide-react';

import { GenerateSitrepModal } from './components/GenerateSitrepModal';
import { createReport, fetchReportsByType } from './reports.service';
import type { CreateReportDTO, ReportDTO } from './reports.types';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';



export function SitrepReportPage(): JSX.Element {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: reports, isLoading, isError } = useQuery({
    queryKey: ['reports', 'SITREP'],
    queryFn: () => fetchReportsByType('SITREP'),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateReportDTO) => createReport(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports', 'SITREP'] });
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
      headerName: 'URL',
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

  const handleGenerateSitrep = (values: { name: string; description: string; periodFrom: string; periodTo: string }) => {
    const dto: CreateReportDTO = {
      repName: values.name,
      repDescription: `${values.description} (Period: ${values.periodFrom} to ${values.periodTo})`,
      repType: 'SITREP',
    };
    createMutation.mutate(dto);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Security SITREP"
        actions={
          <HaButton variant="primary" icon={<Plus size={16} />} onClick={() => setIsModalOpen(true)}>
            Generate SITREP
          </HaButton>
        }
      />

      <div style={{ flex: 1, background: 'var(--ha-background)', padding: '16px' }}>
        {isLoading && <LoadingState message="Loading SITREP reports..." />}

        {isError && !isLoading && (
          <ErrorState
            title="Could not load SITREP reports"
            message="An error occurred while loading the reports."
          />
        )}

        {!isError && !isLoading && (!reports || reports.length === 0) && (
          <EmptyState
            icon={<FileText size={48} />}
            title="No SITREP reports generated yet"
            description="Click 'Generate SITREP' to create your first report."
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

      <GenerateSitrepModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={handleGenerateSitrep}
        isGenerating={createMutation.isPending}
      />
    </div>
  );
}
