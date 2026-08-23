import type { OperationalState, PipelineOperationsInventory, PipelineParser, PipelineSignalsDTO, PipelineSource, PipelineStage } from './pipelineOperations.types';

import { apiClient } from '@/lib/apiClient';
import type { HaDataSourceRecord } from '@/types/dataSource.types';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

interface LegacyParserDTO { id:string; name:string; dataType:string; status:'active'|'inactive'|'error'; lastMatchedCount:number; yamlBody:string; createdAt?:string; updatedAt?:string }

function sourceState(source: HaDataSourceRecord): { state: OperationalState; label: string } {
  if (!source.enabled) return { state:'not_reported', label:'Disabled' };
  if (source.grpcStatus === 'unreachable' && source.opensearchStatus === 'unreachable') return { state:'unavailable', label:'Unreachable' };
  if (source.grpcStatus === 'unreachable' || source.opensearchStatus === 'unreachable') return { state:'attention', label:'Partial dependency' };
  return { state:'observed', label:'Adapters reachable' };
}

function mapSource(source: HaDataSourceRecord): PipelineSource {
  const status=sourceState(source);
  return {id:source.id,name:source.name,type:source.type,transport:'Not reported',enabled:source.enabled,state:status.state,stateLabel:status.label,eps:source.eps,lastEventAt:source.lastEventAt,parser:null,parserVersion:null,normalizedCoverage:null,queueDepth:null,tenantScope:'Not reported by current API',identity:'Not reported by current API',acknowledgement:'Not reported by current API'};
}

function mapParser(parser: LegacyParserDTO): PipelineParser {
  const state:OperationalState=parser.status==='active'?'observed':parser.status==='error'?'attention':'not_reported';
  return {id:parser.id,name:parser.name,dataType:parser.dataType,state,stateLabel:parser.status==='active'?'Configured active':parser.status==='error'?'Configuration error':'Inactive',version:'Not versioned',sources:null,matched24h:parser.lastMatchedCount,failed24h:null,successRate:null,latencyP95Ms:null,fieldCoverage:null,updatedAt:parser.updatedAt??null,schema:'Not reported',deployment:'Runtime deployment not proven'};
}

function buildStages(sources:PipelineSource[],parsers:PipelineParser[],signals:PipelineSignalsDTO|null,snapshotAt:string):PipelineStage[]{
  const sourceUnavailable=sources.filter((item)=>item.state==='unavailable'||item.state==='attention').length;
  const totalEps=sources.reduce((sum,item)=>sum+(item.eps??0),0);
  const lag=signals?.consumerGroupLags.reduce((sum,item)=>sum+(item.totalLag??0),0)??null;
  const parserErrors=parsers.filter((item)=>item.state==='attention').length;
  return [
    {id:'source',label:'Collect',detail:`${sources.length} loaded sources`,state:sourceUnavailable?'attention':sources.length?'observed':'not_reported',stateLabel:sourceUnavailable?`${sourceUnavailable} dependency issue${sourceUnavailable===1?'':'s'}`:sources.length?'Adapters reachable':'No source projection',throughput:sources.length?totalEps:null,backlog:null,failures:null,measuredAt:snapshotAt,evidence:'Current unbounded source API'},
    {id:'broker',label:'Buffer',detail:signals?.topics.length?`${signals.topics.length} observed topics`:'Broker projection unavailable',state:signals?.topics.length?'observed':'not_reported',stateLabel:signals?.topics.length?'Host sample observed':'Not reported',throughput:null,backlog:lag,failures:null,measuredAt:signals?.hostSampleRecordedAt??null,evidence:'Host soak sampler only'},
    {id:'parse',label:'Parse',detail:`${parsers.length} configured parsers`,state:parserErrors?'attention':parsers.length?'observed':'not_reported',stateLabel:parserErrors?`${parserErrors} configuration error${parserErrors===1?'':'s'}`:parsers.length?'Configuration observed':'Not reported',throughput:null,backlog:null,failures:null,measuredAt:snapshotAt,evidence:'Configuration CRUD; runtime not proven'},
    {id:'normalize',label:'Normalize',detail:'Normalized coverage unavailable',state:'not_reported',stateLabel:'Not reported',throughput:null,backlog:null,failures:null,measuredAt:null,evidence:'Canonical quality contract pending'},
    {id:'detect',label:'Detect',detail:'Processing receipts unavailable',state:'not_reported',stateLabel:'Not reported',throughput:null,backlog:null,failures:null,measuredAt:null,evidence:'Processor runtime contract pending'},
    {id:'index',label:'Index',detail:'OpenSearch cluster measurement',state:signals?.opensearchStatus?'observed':'not_reported',stateLabel:signals?.opensearchStatus??'Not reported',throughput:null,backlog:signals?.opensearchUnassignedShards??null,failures:null,measuredAt:signals?.recordedAt??null,evidence:'Cluster-level measurement only'},
  ];
}

async function listLive(signal?:AbortSignal):Promise<PipelineOperationsInventory>{
  const [signalsResult,sourcesResult,parsersResult]=await Promise.allSettled([
    apiClient.get<PipelineSignalsDTO>('/ha-pipeline-signals',{signal}),
    apiClient.get<HaDataSourceRecord[]>('/ha-inputs/sources',{signal}),
    apiClient.get<LegacyParserDTO[]>('/ha-parsers',{signal}),
  ]);
  if(signalsResult.status==='rejected'&&sourcesResult.status==='rejected'&&parsersResult.status==='rejected')throw new Error('Pipeline operations endpoints are unavailable.');
  const snapshotAt=new Date().toISOString();
  const signals=signalsResult.status==='fulfilled'?signalsResult.value:null;
  const sources=sourcesResult.status==='fulfilled'?sourcesResult.value.map(mapSource):[];
  const parsers=parsersResult.status==='fulfilled'?parsersResult.value.map(mapParser):[];
  const warnings=[signalsResult.status==='rejected'?'Capacity signals unavailable':'',sourcesResult.status==='rejected'?'Source inventory unavailable':'',parsersResult.status==='rejected'?'Parser inventory unavailable':'','Quarantine, retry and safe replay inventory are not exposed by the current backend contract'].filter(Boolean);
  return {sources,parsers,failures:[],stages:buildStages(sources,parsers,signals,snapshotAt),signals,snapshotAt,bounded:false,tenantScoped:false,partial:true,warnings};
}

export const pipelineOperationsService={
  fixtureMode,
  async list(signal?:AbortSignal):Promise<PipelineOperationsInventory>{
    if(fixtureMode){const {pipelineOperationsFixture}=await import('./pipelineOperations.fixtures');return structuredClone(pipelineOperationsFixture);}
    return listLive(signal);
  },
};
