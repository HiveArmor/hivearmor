import { useState } from 'react';

import { msspFetch } from '../api/msspFetch';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaInlineBanner } from '@/components/ha-inline-banner/HaInlineBanner';

const ENDPOINT = '/api/ha-mssp/reports/aggregate';

interface ErrorState {
  status: number;
  message: string;
}

export function DownloadAggregateButton(): JSX.Element {
  const [error, setError] = useState<ErrorState | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  async function handleClick(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const response = await msspFetch(ENDPOINT);

      if (response.status !== 200) {
        setError({ status: response.status, message: `Download failed (${response.status})` });
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const filename = parseFilename(disposition) ?? 'hivearmor-mssp-aggregate.xlsx';
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HaButton onClick={handleClick} isDisabled={busy} variant="secondary">
        Download aggregate report
      </HaButton>
      {error !== null && (
        <div style={{ marginTop: '8px' }}>
          <HaInlineBanner
            variant="danger"
            description={error.message}
            isDismissible
            onDismiss={() => setError(null)}
          />
        </div>
      )}
    </div>
  );
}

function parseFilename(contentDisposition: string): string | null {
  const match = /filename="([^"]+)"/.exec(contentDisposition);
  return match !== null ? match[1] : null;
}
