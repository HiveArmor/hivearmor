/**
 * SaveSearchModal — persists the current hunt query via confirmed
 * POST /api/ha-saved-queries (UtmSavedQuery: queryName + queryText).
 */

import { useEffect, useState } from 'react';

import { Form, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';

import { useCreateConfirmedSavedQuery } from '../useConfirmedSavedQueries';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaModal } from '@/components/ha-modal/HaModal';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { ROLE_LABELS, ROLES } from '@/lib/roles';

const SAVE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.USER]}, ${ROLE_LABELS[ROLES.ANALYST]}, ${ROLE_LABELS[ROLES.SOC_MANAGER]}, or ${ROLE_LABELS[ROLES.ADMIN]}`;

export interface SaveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuery: string;
  indexPattern?: string;
  onSave: (huntName: string, isShared: boolean) => void;
  canSave?: boolean;
}

export function SaveSearchModal({
  isOpen,
  onClose,
  currentQuery,
  indexPattern,
  onSave,
  canSave = true,
}: SaveSearchModalProps): JSX.Element {
  const [huntName, setHuntName] = useState('');
  const [isShared, setIsShared] = useState(false);

  const { mutate: createSavedQuery, isPending, isError, isSuccess, error, reset } =
    useCreateConfirmedSavedQuery();

  useEffect(() => {
    if (isOpen) {
      setHuntName('');
      setIsShared(false);
      reset();
    }
  }, [isOpen, currentQuery, reset]);

  const handleSave = (): void => {
    if (!huntName.trim() || !canSave) return;

    createSavedQuery(
      {
        huntName: huntName.trim(),
        queryDsl: currentQuery.trim().length > 0 ? currentQuery.trim() : null,
        isShared,
        indexPattern: indexPattern ?? null,
      },
      {
        onSuccess: () => {
          onSave(huntName.trim(), isShared);
        },
      },
    );
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const isSaveDisabled = !huntName.trim() || isPending || !canSave;
  const deniedByStatus =
    error instanceof Error && /403|forbidden/i.test(error.message) ? SAVE_DENIED : null;

  return (
    <HaModal isOpen={isOpen} onClose={handleClose} title="Save hunt query" width={480} className="hunt-save-modal">
      <ModalHeader
        title="Save hunt query"
        description="Persists to /api/ha-saved-queries so analysts can reload this KQL hunt later."
      />
      <ModalBody>
        <Form className="hunt-save-form">
          {!canSave && (
            <div className="hunt-save-deny" role="status">
              Read-only — {SAVE_DENIED}
            </div>
          )}

          <HaFormGroup label="Hunt name" fieldId="save-search-hunt-name" isRequired>
            <HaTextInput
              id="save-search-hunt-name"
              value={huntName}
              onChange={setHuntName}
              placeholder="e.g. Suspicious PowerShell by Admin"
              autoFocus
              aria-label="Hunt name"
              isDisabled={!canSave}
            />
          </HaFormGroup>

          <div className="hunt-save-query-preview" aria-label="Query that will be saved">
            <span>Query</span>
            <code>{currentQuery.trim() || 'No query text'}</code>
          </div>

          <HaFormGroup label="Share with team" fieldId="save-search-is-shared">
            <HaSwitch
              id="save-search-is-shared"
              label={isShared ? 'Shared with team' : 'Private'}
              isChecked={isShared}
              onChange={setIsShared}
              isDisabled={!canSave}
            />
            <small className="hunt-save-sharing-note">
              {isShared
                ? 'Visible to analysts with access to this tenant scope.'
                : 'Only visible in your saved queries.'}
            </small>
          </HaFormGroup>

          {isError && (
            <div className="hunt-save-error" role="alert">
              {deniedByStatus ?? 'Failed to save query. Check connectivity and try again.'}
            </div>
          )}

          {isSuccess && (
            <div className="hunt-save-success" role="status">
              Query saved to ha-saved-queries.
            </div>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <HaButton variant="primary" isDisabled={isSaveDisabled} isLoading={isPending} onClick={handleSave}>
          Save
        </HaButton>
        <HaButton variant="secondary" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </HaButton>
      </ModalFooter>
    </HaModal>
  );
}
