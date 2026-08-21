import { Wrench } from 'lucide-react';

export interface EngineeringNoticeProps {
  gapId: string;
  title: string;
  description: string;
  requiredEndpoints: string[];
  productDecisionRequired?: boolean;
  productDecisionNote?: string;
  specPath?: string;
  className?: string;
}

export function EngineeringNotice({
  gapId,
  title,
  description,
  requiredEndpoints,
  productDecisionRequired = false,
  productDecisionNote,
  specPath,
  className = '',
}: EngineeringNoticeProps): JSX.Element {
  return (
    <div
      className={`engineering-notice ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: 'var(--ha-space-6)',
      }}
    >
      <div
        className="engineering-notice-icon"
        style={{
          color: 'var(--ha-text-secondary)',
          opacity: 0.6,
          marginBottom: 'var(--ha-space-4)',
        }}
      >
        <Wrench size={48} />
      </div>

      <h3
        style={{
          fontSize: 'var(--ha-text-xl)',
          fontWeight: 'var(--ha-weight-semibold)',
          color: 'var(--ha-text-primary)',
          marginBottom: 'var(--ha-space-2)',
          textAlign: 'center',
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: 'var(--ha-text-base)',
          color: 'var(--ha-text-secondary)',
          maxWidth: '600px',
          textAlign: 'center',
          marginBottom: 'var(--ha-space-6)',
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>

      <div
        style={{
          background: 'var(--ha-surface-primary)',
          border: '1px solid var(--ha-border)',
          borderRadius: 'var(--ha-radius-base)',
          padding: 'var(--ha-space-5)',
          maxWidth: '700px',
          width: '100%',
        }}
      >
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginBottom: 'var(--ha-space-3)',
          }}
        >
          <strong style={{ color: 'var(--ha-text-primary)' }}>Gap:</strong> {gapId}
        </div>

        <div style={{ marginBottom: 'var(--ha-space-4)' }}>
          <div
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              fontWeight: 'var(--ha-weight-semibold)',
              marginBottom: 'var(--ha-space-2)',
            }}
          >
            Required Endpoints:
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              paddingLeft: 'var(--ha-space-4)',
              listStyle: 'disc',
            }}
          >
            {requiredEndpoints.map((endpoint) => (
              <li
                key={endpoint}
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-secondary)',
                  fontFamily: 'var(--ha-font-mono)',
                  marginBottom: 'var(--ha-space-1)',
                }}
              >
                {endpoint}
              </li>
            ))}
          </ul>
        </div>

        {productDecisionRequired && (
          <div
            style={{
              marginBottom: 'var(--ha-space-4)',
              paddingTop: 'var(--ha-space-3)',
              borderTop: '1px solid var(--ha-border)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-primary)',
                fontWeight: 'var(--ha-weight-semibold)',
                marginBottom: 'var(--ha-space-2)',
              }}
            >
              Product Decision: <span style={{ color: 'var(--ha-high)' }}>PENDING</span>
            </div>
            {productDecisionNote && (
              <p
                style={{
                  fontSize: 'var(--ha-text-sm)',
                  color: 'var(--ha-text-secondary)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {productDecisionNote}
              </p>
            )}
          </div>
        )}

        {specPath && (
          <div style={{ paddingTop: 'var(--ha-space-3)', borderTop: '1px solid var(--ha-border)' }}>
            <a
              href={`https://github.com/hivearmor/hivearmor/blob/main/${specPath}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-primary)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--ha-space-1)',
              }}
            >
              View specification in .plan/
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
