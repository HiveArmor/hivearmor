/**
 * SYNTHETIC design fixtures for the PT-2 policy-template library.
 *
 * ⚠️ FICTIONAL DATA — rendered ONLY when `VITE_USE_FOUNDATION_FIXTURES=true` in a DEV
 * build so the offline UI shows a populated library. These rows are invented for visual
 * review; they are NOT real templates and NEVER ship in a production bundle (the prod
 * alias target `policyTemplates.fixture-disabled.ts` throws). Do not treat any value
 * here as proof of a real policy.
 */

import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';

/** A schema-v1 policyConfig JSON string, as the backend stores it. */
function cfg(sections: Record<string, unknown>): string {
  return JSON.stringify({ schema_version: 1, ...sections });
}

/**
 * The visible library: own-ORG templates + cross-tenant GLOBAL ones, mirroring what
 * `GET /agent-policies/templates` returns (own-tenant any scope + all GLOBAL).
 */
export const foundationPolicyTemplates: UtmAgentPolicyDTO[] = [
  {
    id: 9001,
    policyName: 'Linux Server Baseline (CIS L1)',
    description: '[FIXTURE] FIM + CIS L1 scheduled scan for production Linux servers.',
    platform: 'linux',
    scope: 'GLOBAL',
    isTemplate: true,
    versionNum: 4,
    isActive: true,
    createdBy: 'platform-admin',
    createdAt: '2026-09-15T08:12:00Z',
    updatedAt: '2026-10-18T14:30:00Z',
    policyConfig: cfg({
      fim: { mode: 'merge', rules: [{ path: '/etc', recursive: true }] },
      collectors: { auditd: true, syslog: true },
      scans: { cis: { enabled: true, profile: 'cis_level1_server', mode: 'scheduled' } },
    }),
  } as UtmAgentPolicyDTO,
  {
    id: 9002,
    policyName: 'Windows Workstation Hardened',
    description: '[FIXTURE] Registry change monitoring + FIM for corp Windows endpoints.',
    platform: 'windows',
    scope: 'GLOBAL',
    isTemplate: true,
    versionNum: 2,
    isActive: true,
    createdBy: 'platform-admin',
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-10-10T09:15:00Z',
    policyConfig: cfg({
      fim: { mode: 'merge', rules: [{ path: 'C:\\Windows\\System32\\drivers\\etc', recursive: false }] },
      change: { registry: [{ rootKey: 'HKLM\\SOFTWARE' }], installedSoftware: true },
      collectors: { etw: true },
    }),
  } as UtmAgentPolicyDTO,
  {
    id: 9003,
    policyName: 'PCI Cardholder Zone',
    description: '[FIXTURE] High-sensitivity ORG template: FIM + User Log tail + vuln cadence.',
    platform: 'linux',
    scope: 'ORG',
    isTemplate: true,
    versionNum: 7,
    isActive: true,
    createdBy: 'soc-manager',
    createdAt: '2026-08-02T12:00:00Z',
    updatedAt: '2026-10-21T16:45:00Z',
    policyConfig: cfg({
      fim: { mode: 'replace', rules: [{ path: '/var/www', recursive: true }] },
      userLog: [{ fullFileName: '/var/log/payment/audit.log', logPrefix: 'pci-audit' }],
      scans: { vuln: { enabled: true, mode: 'scheduled' }, cis: { enabled: true, profile: 'cis_level2_server', mode: 'scheduled' } },
      collectors: { auditd: true },
    }),
  } as UtmAgentPolicyDTO,
  {
    id: 9004,
    policyName: 'Dev Laptop (Low Touch)',
    description: '[FIXTURE] Minimal ORG template — FIM only, no scans.',
    platform: 'any',
    scope: 'ORG',
    isTemplate: true,
    versionNum: 1,
    isActive: true,
    createdBy: 'soc-manager',
    createdAt: '2026-10-01T09:30:00Z',
    updatedAt: '2026-10-01T09:30:00Z',
    policyConfig: cfg({
      fim: { mode: 'merge', rules: [{ path: '/home', recursive: false }] },
      allow_shell: true,
    }),
  } as UtmAgentPolicyDTO,
  {
    id: 9005,
    policyName: 'macOS Fleet Standard',
    description: '[FIXTURE] FIM + CIS scheduled scan for managed Macs.',
    platform: 'macos',
    scope: 'ORG',
    isTemplate: true,
    versionNum: 3,
    isActive: true,
    createdBy: 'soc-manager',
    createdAt: '2026-09-11T11:00:00Z',
    updatedAt: '2026-10-05T13:20:00Z',
    policyConfig: cfg({
      fim: { mode: 'merge', rules: [{ path: '/Library/LaunchDaemons', recursive: true }] },
      scans: { cis: { enabled: true, profile: 'cis_macos', mode: 'scheduled' } },
    }),
  } as UtmAgentPolicyDTO,
];

export function filterFoundationPolicyTemplates(params: {
  name?: string;
  scope?: string;
  platform?: string;
}): UtmAgentPolicyDTO[] {
  return foundationPolicyTemplates.filter((t) => {
    if (params.name && !t.policyName.toLowerCase().includes(params.name.toLowerCase())) return false;
    if (params.scope && (t as { scope?: string }).scope !== params.scope) return false;
    if (params.platform && params.platform !== 'any' && t.platform !== params.platform) return false;
    return true;
  });
}
