import type { AdminTenant, FederationConnection, IdentityAdministrationInventory, IdentityPrincipal } from './identityAdministration.types';

import { apiClient } from '@/lib/apiClient';
import type { UserDTO } from '@/types/api.types';
import type { ScimTokenStatus } from '@/types/scim';
import type { OidcProviderAdminDTO } from '@/types/sso';


interface HiveTenantDTO { id:number;name:string;domain?:string|null;prefix?:string|null;status?:string|null;licenceExpire?:string|null;createdAt?:string|null }

const fixtureMode=import.meta.env.DEV&&import.meta.env.VITE_USE_FOUNDATION_FIXTURES==='true';

const userState=(user:UserDTO):IdentityPrincipal['state']=>user.activated?'active':'inactive';
const mapUser=(user:UserDTO):IdentityPrincipal=>({
  id:String(user.id),login:user.login,displayName:[user.firstName,user.lastName].filter(Boolean).join(' ')||user.login,email:user.email,state:userState(user),source:'unknown',roles:user.authorities??[],tenantCount:null,mfaState:'unknown',lastSignInAt:null,createdAt:user.createdDate??null,modifiedAt:user.lastModifiedDate??null,reviewState:'unknown',
});
const mapTenant=(tenant:HiveTenantDTO):AdminTenant=>({
  id:String(tenant.id),name:tenant.name,prefix:tenant.prefix??'Not reported',domain:tenant.domain??null,state:(tenant.status?.toLowerCase() as AdminTenant['state']|undefined)??'unknown',administration:'platform',members:null,privilegedMembers:null,identityProviders:null,lastActivityAt:null,licenceExpiresAt:tenant.licenceExpire??null,
});
const mapProvider=(provider:OidcProviderAdminDTO):FederationConnection=>({id:`oidc-${provider.id}`,name:provider.providerName,protocol:'OIDC',state:provider.enabled?'enabled':'disabled',scope:'Platform sign-in',endpointLabel:provider.discoveryUrl,lastActivityAt:provider.updatedAt??null,owner:null,secretState:'protected'});

async function listLive(signal?:AbortSignal):Promise<IdentityAdministrationInventory>{
  const [usersResult,tenantsResult,oidcResult,scimResult]=await Promise.allSettled([
    apiClient.get<UserDTO[]>('/users?page=0&size=100&sort=login,asc',{signal}),
    apiClient.get<HiveTenantDTO[]>('/ha-tenants?page=0&size=100&sort=name,asc',{signal}),
    apiClient.get<OidcProviderAdminDTO[]>('/ha-oidc/providers',{signal}),
    apiClient.get<ScimTokenStatus>('/ha-admin/scim/token/status',{signal}),
  ]);
  if(usersResult.status==='rejected'&&tenantsResult.status==='rejected'&&oidcResult.status==='rejected'&&scimResult.status==='rejected')throw new Error('Identity administration endpoints are unavailable.');
  const users=usersResult.status==='fulfilled'?usersResult.value.map(mapUser):[];
  const tenants=tenantsResult.status==='fulfilled'?tenantsResult.value.map(mapTenant):[];
  const federation:FederationConnection[]=oidcResult.status==='fulfilled'?oidcResult.value.map(mapProvider):[];
  if(scimResult.status==='fulfilled')federation.push({id:'scim-platform',name:'SCIM 2.0 provisioning',protocol:'SCIM',state:scimResult.value.configured?'enabled':'not_configured',scope:'Platform directory',endpointLabel:'/api/ha-scim/v2/',lastActivityAt:scimResult.value.lastUsed,owner:null,secretState:scimResult.value.configured?'protected':'not_configured'});
  const warnings=[usersResult.status==='rejected'?'User directory unavailable':'',tenantsResult.status==='rejected'?'Tenant inventory unavailable':'',oidcResult.status==='rejected'?'OIDC providers unavailable':'',scimResult.status==='rejected'?'SCIM status unavailable':'','Invitations, sessions, tenant memberships, access reviews and immutable identity audit are not exposed by one authoritative contract'].filter(Boolean);
  return {users,tenants,federation,reviews:[],activity:[],totalUsers:users.length,totalTenants:tenants.length,privilegedUsers:users.filter(user=>user.roles.some(role=>role==='ROLE_ADMIN'||role==='MSSP_ADMIN')).length,inactiveUsers:users.filter(user=>user.state==='inactive').length,reviewsDue:null,snapshotAt:new Date().toISOString(),bounded:true,platformScoped:true,partial:true,warnings};
}

export const identityAdministrationService={
  fixtureMode,
  async list(signal?:AbortSignal):Promise<IdentityAdministrationInventory>{
    if(fixtureMode){const {identityAdministrationFixture}=await import('./identityAdministration.fixtures');return structuredClone(identityAdministrationFixture);}
    return listLive(signal);
  },
};
