/**
 * RuleReviewDrawer.tsx — 640px Monaco YAML editor drawer for rule review (Sprint 28, Task 5.6).
 *
 * Displays a generated YAML rule in a read-only Monaco editor. An Edit toggle
 * flips the editor to editable mode and back. Three action buttons (Approve,
 * Reject, Regenerate) invoke the corresponding ruleGenerationService functions.
 *
 * Built on the existing HaDrawer (right-side sliding panel) with width=640.
 *
 * Invariants:
 *   - No `any` types
 *   - No hard-coded hex color literals — all colors via var(--ha-*) tokens
 *   - No `getFirst` calls
 *   - Monaco language: yaml, theme: vs-dark
 *   - Editor is readOnly by default; Edit toggle switches it
 *
 * Requirements: 5.5, 5.6, 5.7, 6.5
 */

import { useState } from 'react';

import Editor from '@monaco-editor/react';

import { HaButton } from '@/components/ha-button';
import { HaDrawer } from '@/components/ha-drawer';
import { HaToggle } from '@/components/ha-toggle';
import type { RuleGenSessionDTO } from '@/types/ruleGeneration.types';

export interface RuleReviewDrawerProps {
  /** The session to display in the drawer, or null if closed. */
  session: RuleGenSessionDTO | null;
  /** Callback to close the drawer. */
  onClose: () => void;
  /** Callback invoked when the admin approves the session. */
  onApprove: (id: number) => void;
  /** Callback invoked when the admin rejects the session. */
  onReject: (id: number) => void;
  /** Callback invoked when the admin requests regeneration. */
  onRegenerate: (id: number) => void;
  /** Whether any action mutation is currently in flight. */
  isActionPending?: boolean;
}

/**
 * RuleReviewDrawer — 640px-wide right-side drawer embedding a Monaco YAML editor.
 *
 * The editor starts in read-only mode. An "Edit" toggle in the toolbar flips
 * readOnly on/off so the admin can tweak the YAML before approving.
 *
 * Footer contains Approve, Reject, and Regenerate action buttons.
 */
export function RuleReviewDrawer({
  session,
  onClose,
  onApprove,
  onReject,
  onRegenerate,
  isActionPending = false,
}: RuleReviewDrawerProps): JSX.Element | null {
  const [readOnly, setReadOnly] = useState(true);

  if (!session) return null;

  const footer = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
      }}
    >
      <HaButton
        variant="primary"
        onClick={() => onApprove(session.id)}
        isDisabled={isActionPending}
        isLoading={isActionPending}
      >
        Approve
      </HaButton>
      <HaButton
        variant="danger"
        onClick={() => onReject(session.id)}
        isDisabled={isActionPending}
      >
        Reject
      </HaButton>
      <HaButton
        variant="secondary"
        onClick={() => onRegenerate(session.id)}
        isDisabled={isActionPending}
      >
        Regenerate
      </HaButton>
    </div>
  );

  return (
    <HaDrawer
      isOpen={session !== null}
      onClose={onClose}
      title={session.ruleName ?? 'Rule Review'}
      subtitle={`Status: ${session.status} · Created: ${new Date(session.createdAt).toLocaleString()}`}
      width={640}
      footer={footer}
    >
      {/* Edit toggle toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginBottom: 12,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          Edit
        </span>
        <HaToggle
          id="rule-review-edit-toggle"
          aria-label="Toggle edit mode"
          isChecked={!readOnly}
          onChange={(checked: boolean) => setReadOnly(!checked)}
        />
      </div>

      {/* Monaco YAML editor */}
      <div
        style={{
          flex: 1,
          minHeight: 400,
          border: '1px solid var(--ha-border)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <Editor
          height="100%"
          language="yaml"
          theme="vs-dark"
          value={session.ruleYaml}
          options={{
            readOnly,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
          }}
        />
      </div>
    </HaDrawer>
  );
}
