import type { DeliveryDestination, DeliveryRoute, IntegrationConnector, IntegrationOperationsInventory } from './integrationOperations.types';

import { apiClient } from '@/lib/apiClient';
import type { HaApiKeyRecord } from '@/types/apiKey.types';
import type { NotificationRuleDTO } from '@/types/notification.types';

const fixtureMode=import.meta.env.DEV&&import.meta.env.VITE_USE_FOUNDATION_FIXTURES==='true';

interface LegacyIntegration {id:number;moduleId?:number;integrationName?:string;integrationDescription?:string;url?:string;integrationIconPath?:string}

const connectorFromLegacy=(item:LegacyIntegration):IntegrationConnector=>({
  id:String(item.id),name:item.integrationName??`Integration ${item.id}`,vendor:'Not reported',kind:'Legacy module',role:'ingest',state:'not_reported',stateLabel:'Runtime health not reported',version:null,environment:'Not reported',endpointLabel:item.url?'Configured endpoint':'Endpoint not reported',credentialAlias:null,owner:null,support:'Not reported',lastObservedAt:null,lastSuccessAt:null,latencyMs:null,operations24h:null,failures24h:null,capabilities:item.integrationDescription?[item.integrationDescription]:[],evidence:`Legacy integration record · module ${item.moduleId??'not reported'}`,
});

const destinationFromRule=(rule:NotificationRuleDTO):DeliveryDestination=>({id:`rule-${rule.id}`,name:rule.name,channelType:rule.destinationType,state:rule.enabled?'not_reported':'unconfigured',stateLabel:rule.enabled?'Dispatch health not reported':'Disabled',credentialAlias:null,endpointLabel:'Destination redacted',routes:1,delivered24h:null,failed24h:null,lastTestedAt:null,lastTestReceipt:null,secretProtected:null});
const routeFromRule=(rule:NotificationRuleDTO):DeliveryRoute=>({id:rule.id,name:rule.name,destinationId:`rule-${rule.id}`,destinationName:rule.name,enabled:rule.enabled,minimumSeverity:(['Informational','Low','Medium','High','Critical'][rule.severityThreshold]??'Not reported'),sources:['Alert'],eventTypes:['Created'],throttleMinutes:null,escalation:null,lastFiredAt:null});

async function listLive(signal?:AbortSignal):Promise<IntegrationOperationsInventory>{
  const [connectorsResult,rulesResult,keysResult]=await Promise.allSettled([
    apiClient.get<LegacyIntegration[]>('/ha-integrations?page=0&size=100&sort=integrationName,asc',{signal}),
    apiClient.get<NotificationRuleDTO[]>('/ha-notification-rules',{signal}),
    apiClient.get<HaApiKeyRecord[]>('/ha-admin/api-keys',{signal}),
  ]);
  if(connectorsResult.status==='rejected'&&rulesResult.status==='rejected'&&keysResult.status==='rejected')throw new Error('Integration operations endpoints are unavailable.');
  const connectors=connectorsResult.status==='fulfilled'?connectorsResult.value.map(connectorFromLegacy):[];
  const rules=rulesResult.status==='fulfilled'?rulesResult.value:[];
  const warnings=[connectorsResult.status==='rejected'?'Connector inventory unavailable':'',rulesResult.status==='rejected'?'Notification routes unavailable':'',keysResult.status==='rejected'?'Access-key inventory unavailable':'','Connector health, delivery receipts and activity ledger are not exposed by the current hardened contract'].filter(Boolean);
  return {connectors,destinations:rules.map(destinationFromRule),routes:rules.map(routeFromRule),keys:keysResult.status==='fulfilled'?keysResult.value:[],activity:[],snapshotAt:new Date().toISOString(),bounded:false,tenantScoped:false,partial:true,warnings};
}

export const integrationOperationsService={
  fixtureMode,
  async list(signal?:AbortSignal):Promise<IntegrationOperationsInventory>{
    if(fixtureMode){const {integrationOperationsFixture}=await import('./integrationOperations.fixtures');return structuredClone(integrationOperationsFixture);}
    return listLive(signal);
  },
};
