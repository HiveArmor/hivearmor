/**
 * HaApiKeyTokenDialog — one-time plaintext API key display.
 *
 * Displays the API key token exactly once immediately after creation.
 * The dialog is intentionally un-closable via backdrop click or Escape —
 * the user MUST click "I have copied the key" to dismiss it (Req 7.3).
 *
 * Security invariants:
 *   - `token` is passed as a prop from the parent's local useState.
 *   - On `onAcknowledge` the parent sets state to null — token never enters
 *     Zustand or localStorage (Req 7.4).
 *   - No `any` types (Req 13.8).
 *   - No hex color literals — all colors via `--ha-*` tokens (Req 13.9).
 *
 * Requirements: 7.3, 7.4, 13.5, 13.7, 13.9
 */

import { useState, useEffect } from 'react';

import { Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HaApiKeyTokenDialogProps {
  /** Plaintext token — shown exactly once. Never stored in Zustand or localStorage. */
  token: string;
  /** Called when the user confirms they have copied the key. Parent clears the token. */
  onAcknowledge: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HaApiKeyTokenDialog({
  token,
  onAcknowledge,
}: HaApiKeyTokenDialogProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  // Reset copied flag if/when token changes (extra safety for re-use).
  useEffect(() => {
    setCopied(false);
  }, [token]);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
    });
  };

  // Backdrop click and Escape are intentionally blocked (Req 7.3).
  // PatternFly Modal fires onClose for both; passing undefined prevents both.
  // We still need isOpen toggled by parent — dialog is open while token !== null.
  const blockClose = (): void => {
    // No-op: the user must explicitly click "I have copied the key".
  };

  return (
    <Modal
      isOpen
      onClose={blockClose}
      aria-label="API Key created"
      style={
        {
          '--pf-v5-c-modal-box--BackgroundColor': 'var(--ha-surface-raised)',
          '--pf-v5-c-modal-box--BoxShadow': 'var(--ha-shadow-medium)',
          '--pf-v5-c-modal-box--BorderColor': 'var(--ha-border)',
          '--pf-v5-c-modal-box--BorderRadius': 'var(--ha-radius-lg)',
          '--pf-v5-c-modal-box__title--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-modal-box__body--Color': 'var(--ha-text-primary)',
          '--pf-v5-c-modal-box--Width': '560px',
        } as React.CSSProperties
      }
    >
      <ModalHeader title="API Key Created" />
      <ModalBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <HaInlineBanner
            variant="warning"
            title="Copy this key now"
            description="HiveArmor cannot show this key again. Once you close this dialog the plaintext token is gone."
            isDismissible={false}
          />

          {/* Token display */}
          <div>
            <p
              style={{
                fontSize: 'var(--ha-text-sm, 0.8125rem)',
                color: 'var(--ha-text-secondary)',
                marginBottom: '8px',
              }}
            >
              Your new API key:
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 14px',
                backgroundColor: 'var(--ha-background)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base, 4px)',
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'var(--ha-text-sm, 0.8125rem)',
                  color: 'var(--ha-primary)',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {token}
              </code>
              <HaButton
                variant="secondary"
                onClick={handleCopy}
                aria-label="Copy API key to clipboard"
                style={{ flexShrink: 0 }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </HaButton>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <HaButton
          variant="primary"
          onClick={onAcknowledge}
          isDisabled={!copied}
          aria-label="Confirm you have copied the key and close this dialog"
        >
          I have copied the key
        </HaButton>
        {!copied && (
          <p
            style={{
              fontSize: 'var(--ha-text-xs, 0.75rem)',
              color: 'var(--ha-text-secondary)',
              margin: '4px 0 0',
            }}
          >
            Copy the key above to enable this button.
          </p>
        )}
      </ModalFooter>
    </Modal>
  );
}
