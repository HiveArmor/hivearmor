/**
 * RuleEditorToolbar — Toolbar actions for rule editor (S23)
 */

import { HaButton } from '@/components/ha-button/HaButton';
import { ROLES } from '@/lib/roles';
import { useAuthStore } from '@/store/auth.store';

export interface RuleEditorToolbarProps {
  isDirty: boolean;
  isSaving: boolean;
  isNew: boolean;
  onSave: () => void;
  onTest: () => void;
  onDiscard: () => void;
  onSigmaImport: () => void;
}

export function RuleEditorToolbar({
  isDirty,
  isSaving,
  isNew,
  onSave,
  onTest,
  onDiscard,
  onSigmaImport,
}: RuleEditorToolbarProps): JSX.Element {
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole(ROLES.ADMIN);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {isDirty && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 8,
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--ha-high)',
            }}
            aria-label="Unsaved changes indicator"
          />
          Unsaved changes
        </div>
      )}

      <HaButton variant="primary" onClick={onSave} isLoading={isSaving} aria-label="Save rule">
        Save
      </HaButton>

      <HaButton
        variant="secondary"
        onClick={onTest}
        isDisabled={isNew || isDirty}
        aria-label="Test rule"
        title={isNew || isDirty ? 'Save your changes before running a test' : undefined}
      >
        Test
      </HaButton>

      <HaButton variant="secondary" onClick={onDiscard} aria-label="Discard changes">
        Discard
      </HaButton>

      {isAdmin && (
        <HaButton variant="secondary" onClick={onSigmaImport} aria-label="Import from Sigma">
          Sigma Import
        </HaButton>
      )}
    </div>
  );
}
