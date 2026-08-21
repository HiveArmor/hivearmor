import { Spinner } from '@patternfly/react-core';

import styles from './AppSuspenseFallback.module.css';

export function AppSuspenseFallback() {
  return (
    <div
      className={styles.fallback}
      role="status"
      aria-label="Loading page"
      aria-live="polite"
    >
      <Spinner size="xl" aria-label="Loading" />
    </div>
  );
}
