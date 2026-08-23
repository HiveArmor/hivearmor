/** Stable fictional compliance aggregates, returned only in the DEV foundation fixture mode. */

import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

export const compliancePostureFixture: HivePostureScoreDTO = { overallScore:76.8,totalFrameworks:6,controlsPassed:312,controlsFailed:74,controlsTotal:407,lastAssessed:'2026-08-21T09:42:00Z',trend:'improving' };
export const complianceFrameworkFixtures: HiveFrameworkScoreDTO[] = [
  { id:'nist-csf-2',name:'NIST Cybersecurity Framework',version:'2.0',description:'Current technical outcome coverage across Govern, Identify, Protect, Detect, Respond and Recover.',controlCount:106,overallScore:79.2,lastAssessed:'2026-08-21T09:42:00Z' },
  { id:'cis-controls-8',name:'CIS Critical Security Controls',version:'8.1',description:'Safeguard observations organized by implementation group and authorized asset scope.',controlCount:153,overallScore:72.4,lastAssessed:'2026-08-21T09:31:00Z' },
  { id:'pci-dss-4',name:'PCI DSS',version:'4.0.1',description:'Technical evidence observed for the currently authorized cardholder-data environment.',controlCount:64,overallScore:68.7,lastAssessed:'2026-08-20T18:10:00Z' },
  { id:'iso-27001-2022',name:'ISO/IEC 27001',version:'2022',description:'Information-security control signals mapped to the active technical inventory.',controlCount:93,overallScore:83.6,lastAssessed:'2026-08-20T17:56:00Z' },
  { id:'soc2-2022',name:'SOC 2 Trust Services Criteria',version:'2022',description:'Technical observations mapped to security, availability and confidentiality criteria.',controlCount:61,overallScore:77.1,lastAssessed:'2026-08-19T14:12:00Z' },
  { id:'hipaa-security',name:'HIPAA Security Rule',version:null,description:'Framework catalog is configured, but an authorized technical evaluation has not been recorded.',controlCount:42,overallScore:0,lastAssessed:null },
];
