/**
 * SaveSearchModal — persists the current hunt query as a named saved hunt.
 *
 * Uses HaModal (PatternFly Modal wrapper), HaTextInput, HaSwitch, and HaButton
 * from the Ha_Wrapper component library. No raw DOM buttons, no hex literals.
 */

import { useEffect, useState } from 'react';

import { Form, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaFormGroup } from '@/components/ha-form-group/HaFormGroup';
import { HaModal } from '@/components/ha-modal/HaModal';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { HaTextInput } from '@/components/ha-text-input/HaTextInput';
import { useCreateSavedHunt } from '@/hooks/useSavedHunts';

export interface SaveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuery: string;
  onSave: (huntName: string, isShared: boolean) => void;
}

export function SaveSearchModal({
  isOpen,
  onClose,
  currentQuery,
  onSave,
}: SaveSearchModalProps): JSX.Element {
  const [huntName, setHuntName] = useState('');
  const [isShared, setIsShared] = useState(false);

  const { mutate: createSavedHunt, isPending, isError, isSuccess, reset } = useCreateSavedHunt();

  // Pre-populate hunt name with the current query when the modal opens
  useEffect(() => {
    if (isOpen) {
      setHuntName('');
      setIsShared(false);
      reset();
    }
  }, [isOpen, currentQuery, reset]);

  const handleSave = (): void => {
    if (!huntName.trim()) return;

    createSavedHunt(
      {
        huntName: huntName.trim(),
        queryDsl: currentQuery.trim().length > 0 ? currentQuery.trim() : null,
        nlQuery: null,
        filterJson: null,
        isShared,
        lastUsedAt: null,
      },
      {
        onSuccess: () => {
          onSave(huntName.trim(), isShared);
        },
      }
    );
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const isSaveDisabled = !huntName.trim() || isPending;

  return (
    <HaModal isOpen={isOpen} onClose={handleClose} title="Save hunt query" width={480} className="hunt-save-modal">
      <ModalHeader
        title="Save hunt query"
        description="Name this query so analysts can rerun it with the current search language and scope."
      />
      <ModalBody>
        <Form className="hunt-save-form">
          <HaFormGroup
            label="Hunt name"
            fieldId="save-search-hunt-name"
            isRequired
          >
            <HaTextInput
              id="save-search-hunt-name"
              value={huntName}
              onChange={setHuntName}
              placeholder="e.g. Suspicious PowerShell by Admin"
              autoFocus
              aria-label="Hunt name"
            />
          </HaFormGroup>

          <div className="hunt-save-query-preview" aria-label="Query that will be saved">
            <span>Query</span>
            <code>{currentQuery.trim() || 'No query text'}</code>
          </div>

          <HaFormGroup
            label="Share with team"
            fieldId="save-search-is-shared"
          >
            <HaSwitch
              id="save-search-is-shared"
              label={isShared ? 'Shared with team' : 'Private'}
              isChecked={isShared}
              onChange={setIsShared}
            />
            <small className="hunt-save-sharing-note">
              {isShared ? 'Visible to analysts with access to this tenant scope.' : 'Only visible in your saved hunts.'}
            </small>
          </HaFormGroup>

          {isError && (
            <div
              role="alert"
              style={{
                color: 'var(--ha-critical)',
                fontSize: 'var(--ha-text-sm)',
                padding: 'var(--ha-space-2) 0',
              }}
            >
              Failed to save search. Please try again.
            </div>
          )}

          {isSuccess && (
            <div
              role="status"
              style={{
                color: 'var(--ha-positive)',
                fontSize: 'var(--ha-text-sm)',
                padding: 'var(--ha-space-2) 0',
              }}
            >
              Search saved successfully.
            </div>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <HaButton
          variant="primary"
          isDisabled={isSaveDisabled}
          isLoading={isPending}
          onClick={handleSave}
        >
          Save
        </HaButton>
        <HaButton variant="secondary" onClick={handleClose} isDisabled={isPending}>
          Cancel
        </HaButton>
      </ModalFooter>
    </HaModal>
  );
}
