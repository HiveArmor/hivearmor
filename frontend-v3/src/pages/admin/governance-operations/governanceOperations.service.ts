import type { GovernanceAuditEvent, GovernanceInventory, GovernanceRetentionPolicy, GovernanceState } from './governanceOperations.types';

import { apiClient } from '@/lib/apiClient';
import type { RetentionPolicyDTO } from '@/types/retention.types';
import type { SystemSettings } from '@/types/systemSettings.types';

interface AuditLogWire {
  id:number|string;
  timestamp:string;
  actor:string;
  actionType:string;
  resourceType:string|null;
  resourceId:string|null;
  details:string;
  ipAddress:string|null;
  payload:Record<string,unknown>|null;
}

interface RetentionPolicyWire extends RetentionPolicyDTO { sourceImmutable?:boolean|null }

const fixtureMode=import.meta.env.DEV&&import.meta.env.VITE_USE_FOUNDATION_FIXTURES==='true';

const actionState=(action:string):GovernanceState=>{
  const value=action.toUpperCase();
  if(value.includes('DENIED')||value.includes('FAIL'))return 'critical';
  if(value.includes('REJECT'))return 'rejected';
  if(value.includes('APPROV'))return 'approved';
  if(value.includes('PENDING')||value.includes('REQUEST'))return 'pending';
  return 'healthy';
};

const mapAudit=(item:AuditLogWire):GovernanceAuditEvent=>({
  id:String(item.id),occurredAt:item.timestamp,actor:item.actor||'system',action:item.actionType||'UNKNOWN',resourceType:item.resourceType??null,resourceId:item.resourceId??null,details:item.details||'No detail supplied',ipAddress:item.ipAddress??null,result:actionState(item.actionType||''),correlationId:null,scope:'Platform scope not reported',payload:null,
});

const mapRetention=(item:RetentionPolicyWire):GovernanceRetentionPolicy=>({
  id:String(item.id),name:item.name,dataType:item.dataType,retentionDays:item.retentionDays,compressionEnabled:item.compressionEnabled,archiveTarget:item.archiveTarget,archivePath:item.archivePath,createdAt:item.createdAt,updatedAt:item.updatedAt,sourceImmutable:item.sourceImmutable===true,legalHoldCount:null,estimatedVolume:null,lifecycleState:'unknown',
});

async function listLive(signal?:AbortSignal):Promise<GovernanceInventory>{
  const [auditResult,retentionResult,settingsResult]=await Promise.allSettled([
    apiClient.get<AuditLogWire[]>('/ha-audit-log',{params:{page:0,size:100},signal}),
    apiClient.get<RetentionPolicyWire[]>('/ha-retention-policies',{signal}),
    apiClient.get<SystemSettings>('/ha-admin/settings',{signal}),
  ]);
  if(auditResult.status==='rejected'&&retentionResult.status==='rejected'&&settingsResult.status==='rejected')throw new Error('Governance administration endpoints are unavailable.');
  const audit=auditResult.status==='fulfilled'?auditResult.value.map(mapAudit):[];
  const retention=retentionResult.status==='fulfilled'?retentionResult.value.map(mapRetention):[];
  const settings=settingsResult.status==='fulfilled'?settingsResult.value:null;
  const warnings=[
    auditResult.status==='rejected'?'Audit ledger unavailable':'',
    retentionResult.status==='rejected'?'Retention inventory unavailable':'',
    settingsResult.status==='rejected'?'Secret-safe platform settings unavailable':'',
    'Audit totals, integrity proofs, tenant scope and correlation IDs are not returned by the current list contract; NDJSON export is available at GET /api/ha-audit-log/export',
    'Legal holds, effective index lifecycle state, volume impact and exception workflows are not exposed',
    'Configuration preview, versioned change requests, approvals, rollout, rollback, drift and API lifecycle inventory are not exposed',
  ].filter(Boolean);
  return {audit,retention,settings,changes:[],lifecycle:[],snapshotAt:new Date().toISOString(),auditTotal:null,denied24h:null,activeHolds:null,pendingChanges:null,configurationDrift:null,deprecatedSurfaces:null,bounded:audit.length<=100,immutableAuditProven:false,partial:true,warnings};
}

export const governanceOperationsService={
  fixtureMode,
  async list(signal?:AbortSignal):Promise<GovernanceInventory>{
    if(fixtureMode){const {governanceOperationsFixture}=await import('./governanceOperations.fixtures');return structuredClone(governanceOperationsFixture);}
    return listLive(signal);
  },
};
