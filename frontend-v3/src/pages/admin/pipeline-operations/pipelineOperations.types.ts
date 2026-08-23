export type PipelineView = 'overview' | 'sources' | 'parsers' | 'failures' | 'capacity';
export type OperationalState = 'observed' | 'healthy' | 'attention' | 'unavailable' | 'not_reported';

export interface ConsumerGroupLag {
  group: string;
  totalLag: number | null;
}

export interface SoakHistoryPoint {
  recordedAt: string | null;
  opensearchStatus: string | null;
  opensearchStoreBytes: number | null;
  consumerLag: number | null;
  sampleFile: string | null;
}

export interface PipelineSignalsDTO {
  recordedAt: string;
  backendStatus: string;
  opensearchStatus: string | null;
  opensearchUnassignedShards: number | null;
  opensearchStoreBytes: number | null;
  postgresHivearmorBytes: number | null;
  consumerGroupLags: ConsumerGroupLag[];
  topics: string[];
  hostSamplePath: string | null;
  hostSampleRecordedAt: string | null;
  hostSampleStatus: string | null;
  soakHistory: SoakHistoryPoint[];
  soakSpanHours: number | null;
  soakSampleCount: number | null;
  limitations: string[];
}

export interface PipelineStage {
  id: string;
  label: string;
  detail: string;
  state: OperationalState;
  stateLabel: string;
  throughput: number | null;
  backlog: number | null;
  failures: number | null;
  measuredAt: string | null;
  evidence: string;
}

export interface PipelineSource {
  id: string;
  name: string;
  type: string;
  transport: string;
  enabled: boolean;
  state: OperationalState;
  stateLabel: string;
  eps: number | null;
  lastEventAt: string | null;
  parser: string | null;
  parserVersion: string | null;
  normalizedCoverage: number | null;
  queueDepth: number | null;
  tenantScope: string;
  identity: string;
  acknowledgement: string;
}

export interface PipelineParser {
  id: string;
  name: string;
  dataType: string;
  state: OperationalState;
  stateLabel: string;
  version: string;
  sources: number | null;
  matched24h: number | null;
  failed24h: number | null;
  successRate: number | null;
  latencyP95Ms: number | null;
  fieldCoverage: number | null;
  updatedAt: string | null;
  schema: string;
  deployment: string;
}

export interface PipelineFailureGroup {
  id: string;
  channel: 'quarantine' | 'retry' | 'failure-store';
  source: string;
  stage: string;
  reasonCode: string;
  reason: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  retryable: boolean;
  redacted: boolean;
  status: 'open' | 'reviewing' | 'replayed' | 'expired';
  parserVersion: string | null;
  tenantScope: string;
}

export interface PipelineOperationsInventory {
  sources: PipelineSource[];
  parsers: PipelineParser[];
  failures: PipelineFailureGroup[];
  stages: PipelineStage[];
  signals: PipelineSignalsDTO | null;
  snapshotAt: string;
  bounded: boolean;
  tenantScoped: boolean;
  partial: boolean;
  warnings: string[];
}
