export interface AlertPivotParams {
  alertId: string | number;
  alertName: string;
  timestamp: string;
  windowMinutes?: number;
  hostname?: string;
  sourceIp?: string;
  indexPattern?: string;
}

/**
 * Builds /logs URL pre-filtered to ±windowMinutes around the alert timestamp.
 */
export function buildAlertPivotUrl(params: AlertPivotParams): string {
  const {
    alertId,
    timestamp,
    windowMinutes = 15,
    hostname,
    sourceIp,
    indexPattern = "logs-*",
  } = params;

  const ts = new Date(timestamp);
  const from = new Date(ts.getTime() - windowMinutes * 60_000).toISOString();
  const to   = new Date(ts.getTime() + windowMinutes * 60_000).toISOString();

  const p = new URLSearchParams({
    from,
    to,
    index: indexPattern,
    pivotFrom: `alert:${alertId}`,
  });

  if (hostname) {
    p.set("q", `host.name:"${hostname}"`);
  } else if (sourceIp) {
    p.set("q", `source.ip:"${sourceIp}"`);
  }

  return `/logs?${p.toString()}`;
}
