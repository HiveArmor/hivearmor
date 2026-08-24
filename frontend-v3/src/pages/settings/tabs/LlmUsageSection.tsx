/**
 * Read-only LLM usage ledger section for System Settings → AI/LLM.
 * Consumes GET /api/ha-llm-usage (+ optional summary). No prompt bodies.
 */

import { useQuery } from '@tanstack/react-query';

import styles from './LlmUsageSection.module.css';

import { llmAdminService } from '@/services/llmAdmin.service';

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function LlmUsageSection(): JSX.Element {
  const usageQuery = useQuery({
    queryKey: ['ha-llm-usage', 0, 25],
    queryFn: () => llmAdminService.listUsage(0, 25),
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['ha-llm-usage-summary'],
    queryFn: () => llmAdminService.getUsageSummary(),
    staleTime: 30_000,
  });

  const items = usageQuery.data?.items ?? [];
  const total = usageQuery.data?.totalCount ?? 0;
  const summary = summaryQuery.data ?? [];

  return (
    <section className={styles.section} aria-labelledby="llm-usage-heading">
      <h3 id="llm-usage-heading" className={styles.heading}>
        LLM usage ledger
      </h3>
      <p className={styles.hint}>
        Recent cascade decisions and token counts. Prompt bodies are never stored or shown.
      </p>

      {summary.length > 0 && (
        <div className={styles.summaryRow} aria-label="Cascade decision counts">
          {summary.map((row) => (
            <span key={row.cascadeDecision} className={styles.summaryChip}>
              {row.cascadeDecision}: {row.count}
            </span>
          ))}
        </div>
      )}

      {usageQuery.isLoading && (
        <p className={styles.hint}>Loading usage…</p>
      )}

      {usageQuery.isError && (
        <p className={styles.error} role="alert">
          Unable to load LLM usage. Required permission: Platform Administrator.
        </p>
      )}

      {!usageQuery.isLoading && !usageQuery.isError && items.length === 0 && (
        <p className={styles.hint}>No usage rows yet.</p>
      )}

      {items.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Prompt</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">User</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.mono}>{formatTs(row.createdAt)}</td>
                    <td>{row.cascadeDecision}</td>
                    <td>{row.cascadeReason ?? '—'}</td>
                    <td className={styles.mono} title={row.promptHash ?? undefined}>
                      {row.promptId ?? '—'}
                    </td>
                    <td className={styles.mono}>
                      {row.totalTokens ?? '—'}
                    </td>
                    <td>{row.userLogin ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.hint}>
            Showing {items.length} of {total}
          </p>
        </>
      )}
    </section>
  );
}
