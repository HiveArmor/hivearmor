/**
 * PT-3 — host→template association types (ranked first-match binding).
 *
 * Mirrors the backend DTOs and the frozen PT-0 `host-template-association.schema.json`.
 * A table is one document `{ scope, orgId, rows[] }`; the resolver evaluates rows by
 * ascending rank and the first matching row's templates are the host's effective policy.
 */

export type AssociationScope = 'GLOBAL' | 'ORG';

/** Exactly one of these predicates on a row's `match`. */
export interface AssociationMatch {
  group?: string;
  host?: string;
  tag?: string;
  any?: true;
}

/** One ranked association row. */
export interface AssociationRow {
  rank: number;
  name: string;
  match: AssociationMatch;
  templates: string[];
}

/** The PT-0 rows document persisted in `rowsJson`. */
export interface AssociationTableDoc {
  scope?: AssociationScope;
  orgId?: string | null;
  rows: AssociationRow[];
}

/** REST DTO from `/api/host-template-associations`. `rowsJson` is a JSON string of {@link AssociationTableDoc}. */
export interface HostTemplateAssociationDTO {
  id?: number;
  name: string;
  scope?: AssociationScope;
  orgId?: string | null;
  rowsJson: string;
  versionNum?: number | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastAppliedAt?: string | null;
}

/** Per-host effective-policy preview from `GET /resolve/{host}`. */
export interface EffectivePolicyDTO {
  host: string;
  matchedRank?: number | null;
  matchedRowName?: string | null;
  matchedBy?: 'group' | 'host' | 'tag' | 'any' | null;
  templates: string[];
  /** merged schema-v1 policyConfig JSON (string), or null if unresolved. */
  resolved?: string | null;
  hasMissingTemplate?: boolean;
  missingTemplates?: string[];
}

/** Per-host Apply outcome. */
export interface HostApplyDTO {
  host: string;
  matchedRank?: number | null;
  matchedRowName?: string | null;
  templates?: string[];
  effectivePolicyId?: number | null;
  status: 'PUSHED' | 'SKIPPED_UNRESOLVED';
  detail?: string | null;
}

/** Result of `POST /{id}/apply`. */
export interface ApplyResultDTO {
  associationId?: number;
  affectedHostCount: number;
  pushedCount: number;
  hosts: HostApplyDTO[];
}

/** Editor form row (rank + a single-predicate match modeled as {kind,value}). */
export type MatchKind = 'group' | 'host' | 'tag' | 'any';

export interface AssociationRowForm {
  rank: number;
  name: string;
  matchKind: MatchKind;
  matchValue: string; // ignored when matchKind === 'any'
  templates: string[];
}
