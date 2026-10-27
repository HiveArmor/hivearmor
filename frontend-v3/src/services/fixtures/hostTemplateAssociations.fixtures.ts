/**
 * SYNTHETIC design fixtures for the PT-3 host→template association surface.
 *
 * ⚠️ FICTIONAL DATA — rendered ONLY in a DEV build with
 * `VITE_USE_FOUNDATION_FIXTURES=true` so the offline UI shows a populated ranked
 * association table, resolver preview and Apply result. These are invented for visual
 * review, are NOT real bindings, and NEVER ship in production (prod alias throws).
 */

import type {
  ApplyResultDTO,
  AssociationTableDoc,
  EffectivePolicyDTO,
  HostTemplateAssociationDTO,
} from '@/types/hostTemplateAssociations';

const PROD_WEB_DOC: AssociationTableDoc = {
  scope: 'ORG',
  orgId: null,
  rows: [
    { rank: 1, name: 'Payment zone', match: { group: 'pci-cardholder' }, templates: ['PCI Cardholder Zone'] },
    { rank: 2, name: 'Prod Linux', match: { group: 'prod-linux' }, templates: ['Linux Server Baseline (CIS L1)'] },
    { rank: 3, name: 'Corp Windows', match: { group: 'corp-windows' }, templates: ['Windows Workstation Hardened'] },
    { rank: 4, name: 'Catch-all', match: { any: true }, templates: ['Dev Laptop (Low Touch)'] },
  ],
};

export const foundationAssociations: HostTemplateAssociationDTO[] = [
  {
    id: 7001,
    name: 'Production fleet binding',
    scope: 'ORG',
    orgId: null,
    rowsJson: JSON.stringify(PROD_WEB_DOC),
    versionNum: 5,
    createdBy: 'soc-manager',
    createdAt: '2026-09-18T09:00:00Z',
    updatedAt: '2026-10-21T15:40:00Z',
    lastAppliedAt: '2026-10-21T15:41:30Z',
  },
  {
    id: 7002,
    name: 'macOS fleet binding',
    scope: 'ORG',
    orgId: null,
    rowsJson: JSON.stringify({
      scope: 'ORG',
      orgId: null,
      rows: [
        { rank: 1, name: 'Managed Macs', match: { group: 'managed-macos' }, templates: ['macOS Fleet Standard'] },
        { rank: 2, name: 'Catch-all', match: { any: true }, templates: ['Dev Laptop (Low Touch)'] },
      ],
    } satisfies AssociationTableDoc),
    versionNum: 2,
    createdBy: 'soc-manager',
    createdAt: '2026-09-25T10:30:00Z',
    updatedAt: '2026-10-12T11:05:00Z',
    lastAppliedAt: '2026-10-12T11:06:10Z',
  },
];

/** A fictional resolver preview for any host string typed into the preview box. */
export function foundationResolveHost(host: string): EffectivePolicyDTO {
  return {
    host,
    matchedRank: 2,
    matchedRowName: 'Prod Linux',
    matchedBy: 'group',
    templates: ['Linux Server Baseline (CIS L1)'],
    resolved: JSON.stringify({
      schema_version: 1,
      fim: { mode: 'merge', rules: [{ path: '/etc', recursive: true }] },
      scans: { cis: { enabled: true, profile: 'cis_level1_server', mode: 'scheduled' } },
    }),
    hasMissingTemplate: false,
    missingTemplates: [],
  };
}

/** A fictional Apply outcome. */
export function foundationApply(id: number): ApplyResultDTO {
  return {
    associationId: id,
    affectedHostCount: 12,
    pushedCount: 11,
    hosts: [
      { host: 'FIN-WKS-044', matchedRank: 1, matchedRowName: 'Payment zone', templates: ['PCI Cardholder Zone'], effectivePolicyId: 9101, status: 'PUSHED' },
      { host: 'research-k8s-node-03', matchedRank: 2, matchedRowName: 'Prod Linux', templates: ['Linux Server Baseline (CIS L1)'], effectivePolicyId: 9102, status: 'PUSHED' },
      { host: 'branch-router-17', matchedRank: 4, matchedRowName: 'Catch-all', templates: ['Dev Laptop (Low Touch)'], effectivePolicyId: null, status: 'SKIPPED_UNRESOLVED', detail: '[FIXTURE] host not enrolled — nothing pushed' },
    ],
  };
}
