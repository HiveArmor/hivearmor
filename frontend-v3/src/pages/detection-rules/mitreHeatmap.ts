/**
 * MITRE ATT&CK heatmap mapping — projects GET /api/mitre/coverage rows onto
 * Enterprise tactic columns. Catalog tactics are a local lookup; the coverage
 * API does not return tactic ids. Unknown techniques stay Unmapped.
 */

import type { TechniqueCoverageDTO } from '@/types/mitre.types';

export const MITRE_TACTIC_ORDER = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
] as const;

export type MitreTacticName = (typeof MITRE_TACTIC_ORDER)[number];
export type MitreCoverageBand = 'none' | 'low' | 'medium' | 'high';
export const UNMAPPED_TACTIC = 'Unmapped';

const T = {
  recon: 'Reconnaissance',
  resdev: 'Resource Development',
  initial: 'Initial Access',
  exec: 'Execution',
  persist: 'Persistence',
  privesc: 'Privilege Escalation',
  evade: 'Defense Evasion',
  cred: 'Credential Access',
  disc: 'Discovery',
  lateral: 'Lateral Movement',
  collect: 'Collection',
  c2: 'Command and Control',
  exfil: 'Exfiltration',
  impact: 'Impact',
} as const satisfies Record<string, MitreTacticName>;

/** Primary Enterprise tactic for parent technique ids (subtechniques inherit). */
export const TECHNIQUE_PRIMARY_TACTIC: Record<string, MitreTacticName> = {
  T1595: T.recon, T1592: T.recon, T1589: T.recon, T1590: T.recon, T1591: T.recon,
  T1598: T.recon, T1597: T.recon, T1596: T.recon, T1593: T.recon, T1594: T.recon,
  T1583: T.resdev, T1584: T.resdev, T1585: T.resdev, T1586: T.resdev, T1587: T.resdev,
  T1588: T.resdev, T1608: T.resdev, T1650: T.resdev,
  T1189: T.initial, T1190: T.initial, T1133: T.initial, T1200: T.initial, T1566: T.initial,
  T1091: T.initial, T1195: T.initial, T1199: T.initial, T1078: T.initial, T1659: T.initial,
  T1059: T.exec, T1203: T.exec, T1559: T.exec, T1106: T.exec, T1053: T.exec,
  T1129: T.exec, T1072: T.exec, T1569: T.exec, T1204: T.exec, T1047: T.exec, T1651: T.exec,
  T1098: T.persist, T1197: T.persist, T1547: T.persist, T1037: T.persist, T1176: T.persist,
  T1554: T.persist, T1136: T.persist, T1543: T.persist, T1546: T.persist, T1137: T.persist,
  T1574: T.persist, T1525: T.persist, T1556: T.persist, T1542: T.persist, T1505: T.persist,
  T1205: T.persist, T1014: T.persist,
  T1134: T.privesc, T1548: T.privesc, T1484: T.privesc, T1611: T.privesc, T1055: T.privesc,
  T1480: T.evade, T1222: T.evade, T1564: T.evade, T1622: T.evade, T1140: T.evade,
  T1610: T.evade, T1006: T.evade, T1562: T.evade, T1070: T.evade, T1202: T.evade,
  T1036: T.evade, T1553: T.evade, T1112: T.evade, T1027: T.evade, T1647: T.evade,
  T1218: T.evade, T1216: T.evade, T1221: T.evade, T1220: T.evade, T1127: T.evade,
  T1550: T.evade,
  T1110: T.cred, T1555: T.cred, T1212: T.cred, T1187: T.cred, T1606: T.cred,
  T1056: T.cred, T1557: T.cred, T1040: T.cred, T1003: T.cred, T1528: T.cred,
  T1649: T.cred, T1558: T.cred, T1539: T.cred, T1111: T.cred, T1621: T.cred, T1552: T.cred,
  T1087: T.disc, T1010: T.disc, T1217: T.disc, T1580: T.disc, T1538: T.disc,
  T1526: T.disc, T1613: T.disc, T1652: T.disc, T1482: T.disc, T1083: T.disc,
  T1615: T.disc, T1046: T.disc, T1135: T.disc, T1201: T.disc, T1120: T.disc,
  T1069: T.disc, T1057: T.disc, T1012: T.disc, T1018: T.disc, T1518: T.disc,
  T1082: T.disc, T1614: T.disc, T1016: T.disc, T1049: T.disc, T1033: T.disc,
  T1007: T.disc, T1124: T.disc,
  T1210: T.lateral, T1534: T.lateral, T1570: T.lateral, T1563: T.lateral, T1021: T.lateral,
  T1080: T.lateral,
  T1560: T.collect, T1123: T.collect, T1119: T.collect, T1115: T.collect, T1530: T.collect,
  T1602: T.collect, T1213: T.collect, T1005: T.collect, T1039: T.collect, T1025: T.collect,
  T1114: T.collect, T1185: T.collect, T1113: T.collect, T1125: T.collect, T1074: T.collect,
  T1071: T.c2, T1092: T.c2, T1132: T.c2, T1001: T.c2, T1568: T.c2, T1573: T.c2,
  T1008: T.c2, T1105: T.c2, T1104: T.c2, T1095: T.c2, T1571: T.c2, T1572: T.c2,
  T1090: T.c2, T1219: T.c2, T1102: T.c2,
  T1020: T.exfil, T1030: T.exfil, T1048: T.exfil, T1041: T.exfil, T1011: T.exfil,
  T1052: T.exfil, T1567: T.exfil, T1029: T.exfil, T1537: T.exfil,
  T1531: T.impact, T1485: T.impact, T1486: T.impact, T1565: T.impact, T1491: T.impact,
  T1561: T.impact, T1499: T.impact, T1657: T.impact, T1495: T.impact, T1490: T.impact,
  T1498: T.impact, T1496: T.impact, T1489: T.impact, T1529: T.impact,
};

const TECHNIQUE_NAMES: Record<string, string> = {
  T1003: 'OS Credential Dumping',
  'T1003.001': 'LSASS Memory',
  T1021: 'Remote Services',
  'T1021.002': 'SMB/Windows Admin Shares',
  T1048: 'Exfiltration Over Alternative Protocol',
  T1059: 'Command and Scripting Interpreter',
  'T1059.001': 'PowerShell',
  T1071: 'Application Layer Protocol',
  'T1071.001': 'Web Protocols',
  'T1071.004': 'DNS',
  T1078: 'Valid Accounts',
  T1098: 'Account Manipulation',
  T1110: 'Brute Force',
  T1114: 'Email Collection',
  'T1114.003': 'Email Forwarding Rule',
  T1204: 'User Execution',
  'T1204.002': 'Malicious File',
  T1547: 'Boot or Logon Autostart Execution',
  'T1547.001': 'Registry Run Keys / Startup Folder',
  T1558: 'Steal or Forge Kerberos Tickets',
  'T1558.003': 'Kerberoasting',
};

const TECHNIQUE_ID_RE = /\bT\d{4}(?:\.\d{3})?\b/i;
const LABELED_TECHNIQUE_RE = /T\d{4}(?:\.\d{3})?\s*[-–—:]\s*(.+)$/i;

export interface InventoryTechniqueSource {
  techniqueId?: string;
  techniqueName?: string;
  tactic?: string;
  ruleActive: boolean;
}

export interface MitreHeatmapCell {
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  ruleCount: number;
  activeCount: number;
  band: MitreCoverageBand;
}

export interface MitreHeatmapColumn {
  tactic: string;
  cells: MitreHeatmapCell[];
  mappedCount: number;
  activeTechniqueCount: number;
}

export interface MitreHeatmap {
  columns: MitreHeatmapColumn[];
  cells: MitreHeatmapCell[];
  mappedTechniques: number;
  activeTechniques: number;
  inactiveTechniques: number;
  coveredTactics: number;
  hasUnmapped: boolean;
}

export function parseTechniqueId(raw: string): string | null {
  const match = raw.trim().match(TECHNIQUE_ID_RE);
  return match ? match[0].toUpperCase() : null;
}

export function parentTechniqueId(techniqueId: string): string {
  const parsed = parseTechniqueId(techniqueId) ?? techniqueId.trim().toUpperCase();
  const dot = parsed.indexOf('.');
  return dot === -1 ? parsed : parsed.slice(0, dot);
}

export function parseCoverageRow(raw: string): { techniqueId: string; techniqueName: string } {
  const trimmed = raw.trim();
  const techniqueId = parseTechniqueId(trimmed) ?? trimmed;
  const labeled = trimmed.match(LABELED_TECHNIQUE_RE);
  const catalogName = TECHNIQUE_NAMES[techniqueId] ?? TECHNIQUE_NAMES[parentTechniqueId(techniqueId)];
  const techniqueName = labeled?.[1]?.trim() || catalogName || (parseTechniqueId(trimmed) ? 'Technique' : trimmed);
  return { techniqueId, techniqueName };
}

export function coverageBand(activeCount: number): MitreCoverageBand {
  if (activeCount <= 0) return 'none';
  if (activeCount <= 2) return 'low';
  if (activeCount <= 5) return 'medium';
  return 'high';
}

export function isKnownTactic(value: string | undefined): value is MitreTacticName {
  return Boolean(value && (MITRE_TACTIC_ORDER as readonly string[]).includes(value));
}

export function resolveTactic(techniqueId: string, fallbackTactic?: string): string {
  if (isKnownTactic(fallbackTactic)) return fallbackTactic;
  const parsed = parseTechniqueId(techniqueId);
  if (!parsed) return UNMAPPED_TACTIC;
  return TECHNIQUE_PRIMARY_TACTIC[parsed]
    ?? TECHNIQUE_PRIMARY_TACTIC[parentTechniqueId(parsed)]
    ?? UNMAPPED_TACTIC;
}

export function coverageFromInventoryRules(rules: InventoryTechniqueSource[]): TechniqueCoverageDTO[] {
  const grouped = new Map<string, { ruleCount: number; activeCount: number }>();
  for (const rule of rules) {
    const techniqueId = parseTechniqueId(rule.techniqueId ?? '');
    if (!techniqueId) continue;
    const current = grouped.get(techniqueId) ?? { ruleCount: 0, activeCount: 0 };
    current.ruleCount += 1;
    if (rule.ruleActive) current.activeCount += 1;
    grouped.set(techniqueId, current);
  }
  return [...grouped.entries()]
    .map(([technique, counts]) => ({
      technique,
      ruleCount: counts.ruleCount,
      activeCount: counts.activeCount,
    }))
    .sort((left, right) => left.technique.localeCompare(right.technique));
}

export function tacticHintsFromInventory(rules: InventoryTechniqueSource[]): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const rule of rules) {
    const techniqueId = parseTechniqueId(rule.techniqueId ?? '');
    if (!techniqueId || !isKnownTactic(rule.tactic)) continue;
    hints[techniqueId] = rule.tactic;
    hints[parentTechniqueId(techniqueId)] = rule.tactic;
  }
  return hints;
}

export function techniqueNamesFromInventory(rules: InventoryTechniqueSource[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const rule of rules) {
    const techniqueId = parseTechniqueId(rule.techniqueId ?? '');
    const name = rule.techniqueName?.trim();
    if (!techniqueId || !name || names[techniqueId]) continue;
    names[techniqueId] = name;
  }
  return names;
}

export function buildMitreHeatmap(
  rows: TechniqueCoverageDTO[],
  options?: {
    tacticHints?: Record<string, string>;
    techniqueNames?: Record<string, string>;
  },
): MitreHeatmap {
  const merged = new Map<string, MitreHeatmapCell>();
  for (const row of rows) {
    const parsed = parseCoverageRow(row.technique);
    const techniqueId = parsed.techniqueId;
    const tactic = resolveTactic(techniqueId, options?.tacticHints?.[techniqueId] ?? options?.tacticHints?.[parentTechniqueId(techniqueId)]);
    const existing = merged.get(techniqueId);
    const ruleCount = (existing?.ruleCount ?? 0) + row.ruleCount;
    const activeCount = (existing?.activeCount ?? 0) + row.activeCount;
    merged.set(techniqueId, {
      techniqueId,
      techniqueName: options?.techniqueNames?.[techniqueId] || existing?.techniqueName || parsed.techniqueName,
      tactic,
      ruleCount,
      activeCount,
      band: coverageBand(activeCount),
    });
  }

  const cells = [...merged.values()].sort((left, right) => left.techniqueId.localeCompare(right.techniqueId));
  const byTactic = new Map<string, MitreHeatmapCell[]>();
  for (const cell of cells) {
    const bucket = byTactic.get(cell.tactic) ?? [];
    bucket.push(cell);
    byTactic.set(cell.tactic, bucket);
  }

  const tacticNames: string[] = [...MITRE_TACTIC_ORDER];
  const hasUnmapped = (byTactic.get(UNMAPPED_TACTIC)?.length ?? 0) > 0;
  if (hasUnmapped) tacticNames.push(UNMAPPED_TACTIC);

  const columns = tacticNames.map((tactic) => {
    const tacticCells = byTactic.get(tactic) ?? [];
    return {
      tactic,
      cells: tacticCells,
      mappedCount: tacticCells.length,
      activeTechniqueCount: tacticCells.filter((cell) => cell.activeCount > 0).length,
    };
  });

  const activeTechniques = cells.filter((cell) => cell.activeCount > 0).length;
  return {
    columns,
    cells,
    mappedTechniques: cells.length,
    activeTechniques,
    inactiveTechniques: cells.length - activeTechniques,
    coveredTactics: columns.filter((column) => column.tactic !== UNMAPPED_TACTIC && column.activeTechniqueCount > 0).length,
    hasUnmapped,
  };
}
