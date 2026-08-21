/**
 * CreateIncidentModal — S16 per CMD-02 spec (escalate action)
 * Modal for escalating selected alerts to a new incident
 */

import { useState } from 'react';

export interface CreateIncidentModalProps {
  isOpen: boolean;
  alertIds: string[];
  onClose: () => void;
  onSubmit: (incidentData: {
    name: string;
    severity: string;
    description: string;
    alertIds: string[];
  }) => Promise<void>;
}

export function CreateIncidentModal({
  isOpen,
  alertIds,
  onClose,
  onSubmit,
}: CreateIncidentModalProps): JSX.Element | null {
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('high');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Incident name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        severity,
        description: description.trim(),
        alertIds,
      });
      // Reset form
      setName('');
      setDescription('');
      setSeverity('high');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create incident');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (): void => {
    setName('');
    setDescription('');
    setSeverity('high');
    setError(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--ha-scrim-strong)',
          zIndex: 300,
        }}
        onClick={handleCancel}
        role="presentation"
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90%',
          maxWidth: '520px',
          background: 'var(--ha-surface-raised)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-md)',
          boxShadow: 'var(--ha-shadow-control)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--ha-border)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--ha-text-lg)',
              fontWeight: 600,
              color: 'var(--ha-text-primary)',
            }}
          >
            Create Incident from Alerts
          </h2>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
            }}
          >
            Escalate {alertIds.length} selected {alertIds.length === 1 ? 'alert' : 'alerts'} to a
            new incident
          </p>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {error && (
            <div
              style={{
                padding: '12px',
                background: 'var(--ha-fill-critical-subtle)',
                border: '1px solid var(--ha-critical)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-critical)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="incident-name"
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: '8px',
              }}
            >
              Incident Name *
            </label>
            <input
              id="incident-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Suspicious lateral movement detected"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
              }}
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="incident-severity"
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: '8px',
              }}
            >
              Severity
            </label>
            <select
              id="incident-severity"
              value={severity}
              onChange={(e) =>
                setSeverity(e.target.value as 'critical' | 'high' | 'medium' | 'low')
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="incident-description"
              style={{
                display: 'block',
                fontSize: 'var(--ha-text-sm)',
                fontWeight: 500,
                color: 'var(--ha-text-primary)',
                marginBottom: '8px',
              }}
            >
              Description
            </label>
            <textarea
              id="incident-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the incident and investigation steps..."
              rows={4}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--ha-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            style={{
              padding: '8px 16px',
              background: 'var(--ha-primary)',
              border: 'none',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-foreground-on-action)',
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 500,
              cursor: isSubmitting || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || !name.trim() ? 0.6 : 1,
            }}
            type="button"
          >
            {isSubmitting ? 'Creating...' : 'Create Incident'}
          </button>
        </div>
      </div>
    </>
  );
}
