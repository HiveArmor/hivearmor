import type { GovernanceInventory } from './governanceOperations.types';

const at=(minutes:number):string=>new Date(Date.UTC(2026,7,23,10,20)-minutes*60_000).toISOString();

export const governanceOperationsFixture:GovernanceInventory={
  audit:[
    {id:'aud-8842',occurredAt:at(2),actor:'priya.nair',action:'SETTINGS_CHANGE_REQUESTED',resourceType:'platform-setting',resourceId:'security.sessionTimeout',details:'Requested session timeout change from 60 to 45 minutes.',ipAddress:'10.44.2.18',result:'pending',correlationId:'chg-2026-0088',scope:'All authorized tenants',payload:{before:'60',after:'45',reason:'Align privileged session policy'}},
    {id:'aud-8841',occurredAt:at(8),actor:'system',action:'RETENTION_POLICY_EVALUATED',resourceType:'retention-policy',resourceId:'ENDPOINT_EVENT',details:'Lifecycle evaluation completed; no indices eligible for transition.',ipAddress:null,result:'healthy',correlationId:'job-ret-772',scope:'Northwind Financial',payload:null},
    {id:'aud-8840',occurredAt:at(17),actor:'omar.haddad',action:'AUTHORIZATION_DENIED',resourceType:'tenant',resourceId:'harbor-health',details:'Cross-tenant configuration read denied by platform authorization policy.',ipAddress:'10.44.9.31',result:'critical',correlationId:'req-701ab2',scope:'Harbor Health',payload:{reasonCode:'TENANT_SCOPE_DENIED'}},
    {id:'aud-8839',occurredAt:at(29),actor:'maya.chen',action:'RETENTION_CHANGE_APPROVED',resourceType:'retention-policy',resourceId:'NETWORK_FLOW',details:'Approved warm-tier transition after 30 days and deletion after 365 days.',ipAddress:'10.44.3.11',result:'approved',correlationId:'chg-2026-0087',scope:'Northwind Financial',payload:null},
    {id:'aud-8838',occurredAt:at(41),actor:'hive-intelligence',action:'AI_PROVIDER_PROBE',resourceType:'ai-provider',resourceId:'bedrock-primary',details:'Governed provider connectivity probe succeeded; secret material was not returned.',ipAddress:null,result:'healthy',correlationId:'probe-541a',scope:'Platform',payload:{latencyMs:184}},
    {id:'aud-8837',occurredAt:at(63),actor:'platform-admin',action:'API_KEY_REVOKED',resourceType:'service-credential',resourceId:'ingest-lab-02',details:'Revoked service credential after owner-requested rotation.',ipAddress:'10.44.1.20',result:'healthy',correlationId:'key-rotate-a2',scope:'Northwind Financial',payload:null},
  ],
  retention:[
    {id:'ret-1',name:'Security audit evidence',dataType:'AUDIT',retentionDays:2555,compressionEnabled:true,archiveTarget:'S3',archivePath:'s3://security-evidence/audit',createdAt:at(88000),updatedAt:at(1440),sourceImmutable:true,legalHoldCount:2,estimatedVolume:'1.8 TB',lifecycleState:'healthy'},
    {id:'ret-2',name:'Endpoint telemetry',dataType:'ENDPOINT_EVENT',retentionDays:365,compressionEnabled:true,archiveTarget:'S3',archivePath:'s3://security-archive/endpoint',createdAt:at(76000),updatedAt:at(4320),sourceImmutable:false,legalHoldCount:1,estimatedVolume:'42.4 TB',lifecycleState:'healthy'},
    {id:'ret-3',name:'Network flows',dataType:'NETWORK_FLOW',retentionDays:365,compressionEnabled:true,archiveTarget:'S3',archivePath:'s3://security-archive/network',createdAt:at(76000),updatedAt:at(29),sourceImmutable:false,legalHoldCount:0,estimatedVolume:'68.1 TB',lifecycleState:'pending'},
    {id:'ret-4',name:'Authentication events',dataType:'AUTH_LOG',retentionDays:730,compressionEnabled:true,archiveTarget:'S3',archivePath:'s3://security-archive/identity',createdAt:at(76000),updatedAt:at(8640),sourceImmutable:false,legalHoldCount:3,estimatedVolume:'6.2 TB',lifecycleState:'healthy'},
    {id:'ret-5',name:'Enrollment audit',dataType:'ENROLLMENT_AUDIT',retentionDays:2555,compressionEnabled:false,archiveTarget:'NONE',archivePath:null,createdAt:at(42000),updatedAt:at(12000),sourceImmutable:true,legalHoldCount:0,estimatedVolume:'18 GB',lifecycleState:'healthy'},
  ],
  settings:{general:{siteName:'HiveArmor',timezone:'Asia/Kolkata',defaultLocale:'en'},email:{host:'smtp.security.example.test',port:587,username:'hivearmor-notify',password:'***',from:'soc@example.test',useTls:true},ai:{provider:'custom',model:'governed-soc-model',endpoint:'https://ai-gateway.example.test/v1',apiKey:'***',apiKeyTouched:false},security:{sessionTimeoutMinutes:60,mfaRequired:true,passwordMinLength:14}},
  changes:[
    {id:'chg-2026-0088',requestedAt:at(2),requestedBy:'Priya Nair',title:'Tighten privileged session timeout',category:'security',scope:'Platform administrators',risk:'medium',state:'pending',approvals:'0/1 · Security Platform',window:'Next maintenance window',rollback:'Restore version 41',version:'draft v42'},
    {id:'chg-2026-0087',requestedAt:at(35),requestedBy:'Elena Rossi',title:'Extend network-flow archive',category:'retention',scope:'Northwind Financial',risk:'high',state:'approved',approvals:'2/2 · Data owner + Compliance',window:'24 Aug · 02:00 IST',rollback:'Restore retention policy v18',version:'approved v19'},
    {id:'chg-2026-0086',requestedAt:at(190),requestedBy:'Marcus Cole',title:'Rotate Hive Intelligence endpoint',category:'ai',scope:'Platform',risk:'high',state:'rejected',approvals:'1/2 · AI governance denied',window:'Not scheduled',rollback:'No change applied',version:'closed v7'},
  ],
  lifecycle:[
    {id:'api-1',surface:'/api/ha-admin/settings',status:'current',successor:null,deprecatedAt:null,sunsetAt:null,consumers:2,owner:'Platform Security'},
    {id:'api-2',surface:'/api/ha-settings',status:'unknown',successor:'/api/ha-admin/settings',deprecatedAt:null,sunsetAt:null,consumers:1,owner:'Platform Security'},
    {id:'api-3',surface:'/api/ha-audit-log',status:'current',successor:null,deprecatedAt:null,sunsetAt:null,consumers:1,owner:'Security Governance'},
    {id:'api-4',surface:'/api/ha-retention-policies',status:'current',successor:null,deprecatedAt:null,sunsetAt:null,consumers:1,owner:'Data Platform'},
  ],
  snapshotAt:at(0),auditTotal:18422,denied24h:7,activeHolds:6,pendingChanges:1,configurationDrift:2,deprecatedSurfaces:0,bounded:true,immutableAuditProven:true,partial:false,warnings:[],
};
