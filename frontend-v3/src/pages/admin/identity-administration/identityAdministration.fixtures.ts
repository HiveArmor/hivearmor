import type { IdentityAdministrationInventory } from './identityAdministration.types';

const now = '2026-08-22T15:42:00.000Z';

export const identityAdministrationFixture: IdentityAdministrationInventory = {
  users: [
    { id:'usr-001',login:'maya.chen',displayName:'Maya Chen',email:'maya.chen@example.test',state:'active',source:'oidc',roles:['ROLE_SOC_MANAGER','ROLE_ANALYST'],tenantCount:4,mfaState:'enforced',lastSignInAt:'2026-08-22T15:36:00Z',createdAt:'2026-01-14T09:20:00Z',modifiedAt:'2026-08-18T07:11:00Z',reviewState:'current' },
    { id:'usr-002',login:'omar.haddad',displayName:'Omar Haddad',email:'omar.haddad@example.test',state:'active',source:'scim',roles:['ROLE_ANALYST'],tenantCount:2,mfaState:'registered',lastSignInAt:'2026-08-22T14:51:00Z',createdAt:'2026-02-02T10:00:00Z',modifiedAt:'2026-08-12T05:23:00Z',reviewState:'due' },
    { id:'usr-003',login:'elena.rossi',displayName:'Elena Rossi',email:'elena.rossi@example.test',state:'active',source:'oidc',roles:['ROLE_ANALYST'],tenantCount:1,mfaState:'enforced',lastSignInAt:'2026-08-22T12:09:00Z',createdAt:'2026-02-19T08:40:00Z',modifiedAt:'2026-07-29T12:03:00Z',reviewState:'current' },
    { id:'usr-004',login:'priya.nair',displayName:'Priya Nair',email:'priya.nair@example.test',state:'active',source:'local',roles:['ROLE_ADMIN'],tenantCount:6,mfaState:'enforced',lastSignInAt:'2026-08-22T15:21:00Z',createdAt:'2025-11-08T06:20:00Z',modifiedAt:'2026-08-21T04:31:00Z',reviewState:'due' },
    { id:'usr-005',login:'marcus.cole',displayName:'Marcus Cole',email:'marcus.cole@example.test',state:'active',source:'scim',roles:['ROLE_READ_ONLY'],tenantCount:1,mfaState:'registered',lastSignInAt:'2026-08-21T16:15:00Z',createdAt:'2026-04-09T09:05:00Z',modifiedAt:'2026-08-02T11:17:00Z',reviewState:'current' },
    { id:'usr-006',login:'aisha.khan',displayName:'Aisha Khan',email:'aisha.khan@example.test',state:'invited',source:'local',roles:['ROLE_ANALYST'],tenantCount:1,mfaState:'not_registered',lastSignInAt:null,createdAt:'2026-08-22T09:05:00Z',modifiedAt:'2026-08-22T09:05:00Z',reviewState:'not_configured' },
    { id:'usr-007',login:'breakglass.soc',displayName:'SOC Break-glass',email:'soc-emergency@example.test',state:'active',source:'local',roles:['ROLE_ADMIN'],tenantCount:6,mfaState:'enforced',lastSignInAt:'2026-06-18T03:14:00Z',createdAt:'2025-09-01T00:00:00Z',modifiedAt:'2026-06-18T03:20:00Z',reviewState:'overdue' },
    { id:'usr-008',login:'james.okafor',displayName:'James Okafor',email:'james.okafor@example.test',state:'inactive',source:'scim',roles:['ROLE_ANALYST'],tenantCount:0,mfaState:'registered',lastSignInAt:'2026-07-04T13:28:00Z',createdAt:'2026-01-29T04:50:00Z',modifiedAt:'2026-08-19T05:00:00Z',reviewState:'current' },
  ],
  tenants: [
    { id:'ten-001',name:'Northwind Financial',prefix:'northwind',domain:'northwind.example.test',state:'active',administration:'tenant_local',members:38,privilegedMembers:4,identityProviders:2,lastActivityAt:'2026-08-22T15:39:00Z',licenceExpiresAt:'2027-02-28T00:00:00Z' },
    { id:'ten-002',name:'Acme Manufacturing',prefix:'acme',domain:'acme.example.test',state:'active',administration:'mssp',members:24,privilegedMembers:3,identityProviders:1,lastActivityAt:'2026-08-22T15:33:00Z',licenceExpiresAt:'2027-04-18T00:00:00Z' },
    { id:'ten-003',name:'Harbor Health',prefix:'harbor-health',domain:'harbor.example.test',state:'active',administration:'mssp',members:17,privilegedMembers:2,identityProviders:1,lastActivityAt:'2026-08-22T14:58:00Z',licenceExpiresAt:'2027-01-12T00:00:00Z' },
    { id:'ten-004',name:'Meridian Retail',prefix:'meridian',domain:'meridian.example.test',state:'provisioning',administration:'platform',members:6,privilegedMembers:1,identityProviders:0,lastActivityAt:'2026-08-22T10:12:00Z',licenceExpiresAt:'2027-07-01T00:00:00Z' },
    { id:'ten-005',name:'Atlas Research',prefix:'atlas',domain:'atlas.example.test',state:'suspended',administration:'mssp',members:12,privilegedMembers:2,identityProviders:1,lastActivityAt:'2026-08-08T07:45:00Z',licenceExpiresAt:'2026-09-30T00:00:00Z' },
  ],
  federation: [
    { id:'fed-oidc-01',name:'Northwind Entra ID',protocol:'OIDC',state:'enabled',scope:'Northwind Financial',endpointLabel:'login.microsoftonline.com/…',lastActivityAt:'2026-08-22T15:36:00Z',owner:'Identity Engineering',secretState:'protected' },
    { id:'fed-oidc-02',name:'MSSP Workforce Okta',protocol:'OIDC',state:'enabled',scope:'Platform workforce',endpointLabel:'hivearmor.okta.example/…',lastActivityAt:'2026-08-22T15:21:00Z',owner:'Platform Security',secretState:'protected' },
    { id:'fed-scim-01',name:'SCIM provisioning',protocol:'SCIM',state:'enabled',scope:'Platform directory',endpointLabel:'/api/ha-scim/v2/',lastActivityAt:'2026-08-22T14:44:00Z',owner:'Identity Engineering',secretState:'protected' },
    { id:'fed-oidc-03',name:'Atlas Workforce',protocol:'OIDC',state:'disabled',scope:'Atlas Research',endpointLabel:'id.atlas.example/…',lastActivityAt:'2026-08-08T07:45:00Z',owner:null,secretState:'protected' },
  ],
  reviews: [
    { id:'rev-001',name:'Platform administrators quarterly review',scope:'ROLE_ADMIN · platform',reviewer:'Security Governance',cadence:'Quarterly',dueAt:'2026-08-26T17:00:00Z',decisionsComplete:6,decisionsTotal:8,state:'due',highPrivilege:true },
    { id:'rev-002',name:'MSSP delegated access recertification',scope:'3 managed tenants',reviewer:'Maya Chen',cadence:'Monthly',dueAt:'2026-08-24T17:00:00Z',decisionsComplete:14,decisionsTotal:18,state:'due',highPrivilege:true },
    { id:'rev-003',name:'Dormant analyst access',scope:'No sign-in for 30 days',reviewer:'Omar Haddad',cadence:'Monthly',dueAt:'2026-08-20T17:00:00Z',decisionsComplete:7,decisionsTotal:12,state:'overdue',highPrivilege:false },
    { id:'rev-004',name:'Northwind tenant administrators',scope:'Northwind Financial',reviewer:'Tenant owner',cadence:'Quarterly',dueAt:'2026-09-02T17:00:00Z',decisionsComplete:4,decisionsTotal:4,state:'complete',highPrivilege:true },
  ],
  activity: [
    { id:'aud-001',occurredAt:'2026-08-22T15:31:18Z',actor:'priya.nair',action:'Role assignment changed',target:'omar.haddad',scope:'Acme Manufacturing',result:'success',reason:'Analyst rotation approved · CHG-4182',correlationId:'iam-6c18e4' },
    { id:'aud-002',occurredAt:'2026-08-22T14:44:09Z',actor:'scim-service',action:'User provisioned',target:'aisha.khan',scope:'Northwind Financial',result:'success',reason:'Authorized SCIM create',correlationId:'scim-a10d23' },
    { id:'aud-003',occurredAt:'2026-08-22T13:58:47Z',actor:'omar.haddad',action:'Tenant access requested',target:'Harbor Health',scope:'MSSP delegation',result:'warning',reason:'Awaiting tenant owner approval',correlationId:'iam-009d0b' },
    { id:'aud-004',occurredAt:'2026-08-22T11:21:00Z',actor:'unknown-principal',action:'Break-glass sign-in denied',target:'breakglass.soc',scope:'Platform',result:'denied',reason:'Step-up authentication not satisfied',correlationId:'auth-b87f11' },
    { id:'aud-005',occurredAt:'2026-08-21T18:03:41Z',actor:'maya.chen',action:'Access review decision',target:'james.okafor',scope:'Dormant analyst access',result:'success',reason:'Access removed after manager confirmation',correlationId:'rev-c7180f' },
  ],
  totalUsers: 84,
  totalTenants: 5,
  privilegedUsers: 11,
  inactiveUsers: 7,
  reviewsDue: 3,
  snapshotAt: now,
  bounded: true,
  platformScoped: true,
  partial: false,
  warnings: [],
};
