/**
 * CMD-07 — Alert Context Drawer
 * Alert detail side drawer (420px, inline at ≥1280px, overlay at <1280px)
 */

import { useState } from 'react';

import { AlertCircle, X } from 'lucide-react';

import type { AlertDetailDTO } from './alertContextDrawer.types';

import { AiChatPanel } from '@/components/ai-chat/AiChatPanel';
import { AiTriageSection } from '@/components/ai-chat/AiTriageSection';
import { useAiStatus } from '@/hooks/useAiTriage';

export interface AlertContextDrawerProps {
  alertId: string | null;
  onClose: () => void;
  isOpen: boolean;
}

export function AlertContextDrawer({
  alertId,
  onClose,
  isOpen,
}: AlertContextDrawerProps): JSX.Element | null {
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const status = useAiStatus();

  if (!isOpen || !alertId) {
    return null;
  }

  // TODO: Wire to GET /api/ha-alerts/{id} endpoint when it exists
  const alert: Partial<AlertDetailDTO> = {
    id: alertId,
    severity: 1,
    timestamp: new Date().toISOString(),
    title: 'Loading...',
    category: '',
    status: 'open',
    adversary: null,
    target: null,
    tags: [],
    ruleId: null,
    ruleName: null,
    rawFields: {},
  };
  // Alert data will be used when full implementation is wired
  void alert;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-drawer-title"
      style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 420,
        background: 'var(--ha-surface-primary)',
        borderLeft: '1px solid var(--ha-border)',
        boxShadow: 'var(--ha-shadow-control)',
        zIndex: 'var(--ha-z-drawer)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header — Fixed */}
      <div
        style={{
          height: 56,
          borderBottom: '1px solid var(--ha-border)',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <h2
          id="alert-drawer-title"
          style={{
            fontSize: 'var(--ha-text-md)',
            color: 'var(--ha-text-primary)',
            margin: 0,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '70%',
          }}
        >
          Alert Detail — Coming Soon
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Ask AI button */}
          <button
            type="button"
            onClick={() => setAiChatOpen(true)}
            aria-label="Open AI assistant for this alert"
            style={{
              background: 'none',
              border: '1px solid var(--ha-intelligence)',
              color: 'var(--ha-intelligence)',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 500,
            }}
          >
            Ask AI
          </button>
          <button
            onClick={onClose}
            aria-label="Close alert drawer"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--ha-text-secondary)',
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Body — Scrollable */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 40,
            textAlign: 'center',
          }}
        >
          <AlertCircle
            size={48}
            color="var(--ha-primary)"
            strokeWidth={1.5}
            style={{ opacity: 0.6, marginBottom: 16 }}
          />
          <p
            style={{
              fontSize: 'var(--ha-text-base)',
              color: 'var(--ha-text-secondary)',
              marginBottom: 8,
              lineHeight: 1.6,
            }}
          >
            Alert detail drawer implementation is pending.
          </p>
          <p
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              opacity: 0.8,
              fontFamily: 'var(--ha-font-mono)',
            }}
          >
            {/* TODO: ENDPOINT_VERIFICATION_REQUIRED — verify GET /api/ha-alerts/{alertId} exists */}
            Backend endpoint: GET /api/ha-alerts/{alertId}
          </p>
        </div>

        {/* AI Triage section — immediately after MITRE ATT&CK section */}
        <AiTriageSection
          alertId={alertId}
          statusConfigured={status.data?.configured === true}
        />
      </div>

      {/* Footer — Fixed */}
      <div
        style={{
          height: 56,
          borderTop: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <a
          href="#"
          style={{
            color: 'var(--ha-primary)',
            fontSize: 'var(--ha-text-sm)',
            textDecoration: 'none',
          }}
        >
          {/* TODO: wire to alert detail route */}
          View Full Detail
        </a>
        <button
          style={{
            background: 'var(--ha-primary)',
            color: 'var(--ha-background)',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 'var(--ha-radius-base)',
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Promote to Incident
        </button>
      </div>

      {/* AiChatPanel — opened by Ask AI button */}
      <AiChatPanel
        open={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        contextType="alert"
        contextId={alertId}
        contextSummary={alert.title}
      />
    </div>
  );
}
