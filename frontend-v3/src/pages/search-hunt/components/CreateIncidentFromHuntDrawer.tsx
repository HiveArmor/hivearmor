/**
 * CreateIncidentFromHuntDrawer — Hunt-to-Incident workflow drawer.
 *
 * Opens when the analyst selects ≥1 rows in the HuntGrid and clicks
 * "Create Incident (N)".  Submits a POST /api/ha-incidents body that
 * includes the selected OpenSearch _id values as evidenceEventIds.
 *
 * Requirements: 4.5, 4.6, 4.7, 4.8, 4.10, 7.4, 7.5
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaSelect } from '@/components/ha-select/HaSelect';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { apiClient } from '@/lib/apiClient';
import type { CreateIncidentFromHuntRequest, HuntUserDTO } from '@/types/search';

export interface CreateIncidentFromHuntDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEventIds: string[];
  currentQuery: string;
}

/** Compute the initial incident name from the current hunt query. */
function deriveIncidentName(currentQuery: string): string {
  return currentQuery.trim().length > 0
    ? `Hunt: ${currentQuery.trim()}`
    : 'Hunt Investigation';
}

const SEVERITY_OPTIONS = [
  { value: '1', label: '1 — Informational' },
  { value: '2', label: '2 — Low' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4 — High' },
  { value: '5', label: '5 — Critical' },
];

interface CreatedIncidentResponse {
  id: number | string;
}

export function CreateIncidentFromHuntDrawer({
  isOpen,
  onClose,
  selectedEventIds,
  currentQuery,
}: CreateIncidentFromHuntDrawerProps): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [incidentName, setIncidentName] = useState<string>(() =>
    deriveIncidentName(currentQuery)
  );
  const [incidentSeverity, setIncidentSeverity] = useState<number>(3);
  const [incidentAssignedTo, setIncidentAssignedTo] = useState<string>('');

  // Re-derive the incident name whenever the drawer opens with a new query.
  useEffect(() => {
    if (isOpen) {
      setIncidentName(deriveIncidentName(currentQuery));
      setIncidentSeverity(3);
      setIncidentAssignedTo('');
    }
  }, [isOpen, currentQuery]);

  // Fetch assignee options (ANALYST + ADMIN users).
  const { data: analysts } = useQuery<HuntUserDTO[]>({
    queryKey: ['ha-users-analysts'],
    queryFn: () =>
      apiClient.get<HuntUserDTO[]>(
        '/ha-users?authorities=ANALYST,ADMIN&size=100'
      ),
    staleTime: 60_000,
    enabled: isOpen,
  });

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...(analysts ?? []).map((u) => ({
      value: u.login,
      label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.login,
    })),
  ];

  // POST /api/ha-incidents mutation.
  const mutation = useMutation<
    CreatedIncidentResponse,
    Error,
    CreateIncidentFromHuntRequest
  >({
    mutationFn: (body: CreateIncidentFromHuntRequest) =>
      apiClient.post<CreatedIncidentResponse>('/ha-incidents', body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['incidents'] });
      onClose();
      navigate(`/incidents/${data.id}`);
    },
  });

  const handleSubmit = (): void => {
    if (incidentName.trim().length === 0) return;

    const body: CreateIncidentFromHuntRequest = {
      incidentName: incidentName.trim(),
      incidentStatus: 1,
      incidentSeverity,
      evidenceEventIds: selectedEventIds,
    };

    if (incidentAssignedTo.length > 0) {
      body.incidentAssignedTo = incidentAssignedTo;
    }

    mutation.mutate(body);
  };

  const isSubmitDisabled =
    mutation.isPending || incidentName.trim().length === 0;

  const drawerSubtitle =
    selectedEventIds.length === 1
      ? '1 event selected'
      : `${selectedEventIds.length} events selected`;

  const footer = (
    <>
      <HaButton
        variant="primary"
        onClick={handleSubmit}
        isDisabled={isSubmitDisabled}
        isLoading={mutation.isPending}
      >
        Create Incident
      </HaButton>
      <HaButton variant="secondary" onClick={onClose} isDisabled={mutation.isPending}>
        Cancel
      </HaButton>
    </>
  );

  return (
    <HaDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Create Incident from Hunt"
      subtitle={drawerSubtitle}
      footer={footer}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Incident Name */}
        <HaFormGroup
          label="Incident Name"
          fieldId="hunt-incident-name"
          isRequired
        >
          <HaTextInput
            id="hunt-incident-name"
            value={incidentName}
            onChange={setIncidentName}
            placeholder="Enter incident name"
            aria-required="true"
          />
        </HaFormGroup>

        {/* Severity */}
        <HaFormGroup label="Severity" fieldId="hunt-incident-severity">
          <HaSelect
            options={SEVERITY_OPTIONS}
            value={String(incidentSeverity)}
            onChange={(val) => setIncidentSeverity(Number(val))}
          />
        </HaFormGroup>

        {/* Assignee */}
        <HaFormGroup label="Assign To" fieldId="hunt-incident-assignee">
          <HaSelect
            options={assigneeOptions}
            value={incidentAssignedTo}
            onChange={setIncidentAssignedTo}
            placeholder="Unassigned"
          />
        </HaFormGroup>

        {/* Evidence summary */}
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 6,
            }}
          >
            Evidence
          </div>
          <div
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              fontFamily: 'var(--ha-font-mono)',
            }}
          >
            {selectedEventIds.length} event
            {selectedEventIds.length !== 1 ? 's' : ''} will be attached
          </div>
        </div>

        {/* Mutation error */}
        {mutation.isError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-critical)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-critical)',
            }}
          >
            {mutation.error?.message ?? 'Failed to create incident. Please try again.'}
          </div>
        )}
      </div>
    </HaDrawer>
  );
}
