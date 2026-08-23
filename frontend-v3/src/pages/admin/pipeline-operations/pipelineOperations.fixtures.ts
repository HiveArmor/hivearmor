import type { PipelineOperationsInventory } from './pipelineOperations.types';

const at = (minutesAgo: number): string => new Date(Date.UTC(2026, 7, 21, 12, 30) - minutesAgo * 60_000).toISOString();

export const pipelineOperationsFixture: PipelineOperationsInventory = {
  snapshotAt: at(0), bounded: true, tenantScoped: true, partial: true,
  warnings: ['Replay and parser deployment are review-only design fixtures; no event is reprocessed.'],
  stages: [
    { id:'source',label:'Collect',detail:'Agents · Syslog · Cloud',state:'attention',stateLabel:'1 source delayed',throughput:12840,backlog:38,failures:2,measuredAt:at(0),evidence:'Authorized source inventory' },
    { id:'broker',label:'Buffer',detail:'ha.raw-event.v1',state:'observed',stateLabel:'Acknowledged',throughput:12812,backlog:38,failures:0,measuredAt:at(0),evidence:'Host sampler · acks=all' },
    { id:'parse',label:'Parse',detail:'6 deployed parsers',state:'attention',stateLabel:'2 failure groups',throughput:12794,backlog:14,failures:18,measuredAt:at(1),evidence:'Parser runtime projection' },
    { id:'normalize',label:'Normalize',detail:'Hive schema 3.1',state:'observed',stateLabel:'98.6% coverage',throughput:12776,backlog:8,failures:18,measuredAt:at(1),evidence:'Bounded field-quality sample' },
    { id:'detect',label:'Detect',detail:'CEL · correlation',state:'observed',stateLabel:'Runtime observed',throughput:12776,backlog:3,failures:0,measuredAt:at(1),evidence:'Processor receipt projection' },
    { id:'index',label:'Index',detail:'OpenSearch',state:'observed',stateLabel:'Yellow · 0 unassigned',throughput:12773,backlog:0,failures:3,measuredAt:at(0),evidence:'OpenSearch cluster measurement' },
  ],
  sources: [
    {id:'src-001',name:'Endpoint fleet · production',type:'agent',transport:'gRPC + signed identity',enabled:true,state:'healthy',stateLabel:'Receiving',eps:6840,lastEventAt:at(0),parser:'Hive endpoint telemetry',parserVersion:'v12',normalizedCoverage:99.4,queueDepth:4,tenantScope:'All authorized tenants',identity:'Enrolled device credential',acknowledgement:'Durable spool + broker ack'},
    {id:'src-002',name:'Windows security collectors',type:'wineventlog',transport:'Agent forwarder',enabled:true,state:'healthy',stateLabel:'Receiving',eps:2860,lastEventAt:at(0),parser:'Windows Security Events',parserVersion:'v9',normalizedCoverage:98.7,queueDepth:3,tenantScope:'Northwind Financial',identity:'Enrolled collector',acknowledgement:'Durable spool + broker ack'},
    {id:'src-003',name:'Core network syslog',type:'syslog',transport:'TLS Syslog',enabled:true,state:'healthy',stateLabel:'Receiving',eps:1980,lastEventAt:at(1),parser:'CEF network security',parserVersion:'v7',normalizedCoverage:97.8,queueDepth:8,tenantScope:'All authorized tenants',identity:'mTLS listener',acknowledgement:'Broker acknowledged'},
    {id:'src-004',name:'AWS organization trail',type:'aws',transport:'S3 + SQS',enabled:true,state:'attention',stateLabel:'Delayed 18m',eps:742,lastEventAt:at(18),parser:'AWS CloudTrail',parserVersion:'v6',normalizedCoverage:99.1,queueDepth:21,tenantScope:'Northwind cloud',identity:'Assumed workload role',acknowledgement:'Checkpointed object'},
    {id:'src-005',name:'Azure identity audit',type:'azure',transport:'Event Hub',enabled:true,state:'healthy',stateLabel:'Receiving',eps:318,lastEventAt:at(2),parser:'Azure identity',parserVersion:'v5',normalizedCoverage:96.9,queueDepth:2,tenantScope:'Northwind identity',identity:'Managed application',acknowledgement:'Partition checkpoint'},
    {id:'src-006',name:'Threat intelligence exchange',type:'kafka',transport:'Kafka',enabled:true,state:'attention',stateLabel:'Partial parse',eps:76,lastEventAt:at(3),parser:'STIX observations',parserVersion:'v3',normalizedCoverage:88.4,queueDepth:0,tenantScope:'Shared intelligence',identity:'Connector credential',acknowledgement:'Broker acknowledged'},
    {id:'src-007',name:'GCP audit archive',type:'gcp',transport:'Pub/Sub',enabled:false,state:'not_reported',stateLabel:'Disabled',eps:0,lastEventAt:at(420),parser:'GCP audit',parserVersion:'v2',normalizedCoverage:null,queueDepth:null,tenantScope:'Research tenant',identity:'Workload identity',acknowledgement:'Not collecting'},
  ],
  parsers: [
    {id:'prs-001',name:'Hive endpoint telemetry',dataType:'endpoint',state:'healthy',stateLabel:'Deployed',version:'v12',sources:1,matched24h:28144092,failed24h:14,successRate:99.99,latencyP95Ms:3.8,fieldCoverage:99.4,updatedAt:at(1440),schema:'Hive normalized event 3.1',deployment:'Production · 21 nodes'},
    {id:'prs-002',name:'Windows Security Events',dataType:'windows',state:'healthy',stateLabel:'Deployed',version:'v9',sources:1,matched24h:12442208,failed24h:6,successRate:99.99,latencyP95Ms:4.2,fieldCoverage:98.7,updatedAt:at(2880),schema:'Hive normalized event 3.1',deployment:'Production · 21 nodes'},
    {id:'prs-003',name:'CEF network security',dataType:'cef',state:'healthy',stateLabel:'Deployed',version:'v7',sources:1,matched24h:8852100,failed24h:41,successRate:99.98,latencyP95Ms:5.6,fieldCoverage:97.8,updatedAt:at(4320),schema:'Hive normalized event 3.1',deployment:'Production · 21 nodes'},
    {id:'prs-004',name:'AWS CloudTrail',dataType:'cloud',state:'healthy',stateLabel:'Deployed',version:'v6',sources:1,matched24h:3328400,failed24h:2,successRate:99.99,latencyP95Ms:4.9,fieldCoverage:99.1,updatedAt:at(5760),schema:'Hive normalized event 3.1',deployment:'Production · 21 nodes'},
    {id:'prs-005',name:'Azure identity',dataType:'identity',state:'healthy',stateLabel:'Deployed',version:'v5',sources:1,matched24h:1192840,failed24h:9,successRate:99.97,latencyP95Ms:6.8,fieldCoverage:96.9,updatedAt:at(7200),schema:'Hive normalized event 3.1',deployment:'Production · 21 nodes'},
    {id:'prs-006',name:'STIX observations',dataType:'threat-intel',state:'attention',stateLabel:'Needs review',version:'v3',sources:1,matched24h:28192,failed24h:84,successRate:97.11,latencyP95Ms:12.4,fieldCoverage:88.4,updatedAt:at(180),schema:'Hive intelligence observation 2.0',deployment:'Production · 21 nodes'},
  ],
  failures: [
    {id:'fail-001',channel:'quarantine',source:'Threat intelligence exchange',stage:'Parse',reasonCode:'SCHEMA_FIELD_TYPE',reason:'Observed object field does not match the deployed STIX parser type.',count:64,firstSeenAt:at(240),lastSeenAt:at(3),retryable:true,redacted:true,status:'reviewing',parserVersion:'v3',tenantScope:'Shared intelligence'},
    {id:'fail-002',channel:'quarantine',source:'Core network syslog',stage:'Parse',reasonCode:'CEF_HEADER_INVALID',reason:'A bounded group of messages has an invalid CEF header.',count:18,firstSeenAt:at(95),lastSeenAt:at(8),retryable:true,redacted:true,status:'open',parserVersion:'v7',tenantScope:'All authorized tenants'},
    {id:'fail-003',channel:'retry',source:'AWS organization trail',stage:'Collect',reasonCode:'UPSTREAM_THROTTLED',reason:'The upstream object fetch was throttled after the configured retry budget.',count:21,firstSeenAt:at(28),lastSeenAt:at(18),retryable:true,redacted:true,status:'open',parserVersion:null,tenantScope:'Northwind cloud'},
    {id:'fail-004',channel:'failure-store',source:'Endpoint fleet · production',stage:'Index',reasonCode:'MAPPING_REJECTED',reason:'Three normalized events were rejected by the current index mapping.',count:3,firstSeenAt:at(47),lastSeenAt:at(44),retryable:false,redacted:true,status:'open',parserVersion:'v12',tenantScope:'All authorized tenants'},
  ],
  signals: {
    recordedAt:at(0),backendStatus:'UP',opensearchStatus:'yellow',opensearchUnassignedShards:0,opensearchStoreBytes:8128849012,postgresHivearmorBytes:941887200,
    consumerGroupLags:[{group:'eventprocessor',totalLag:38},{group:'entity-projector',totalLag:3}],topics:['hivearmor.raw.events','hivearmor.raw.events.quarantine','hivearmor.raw.events.retry'],hostSamplePath:'/var/hivearmor-slo-soak/latest.json',hostSampleRecordedAt:at(0),hostSampleStatus:'script-complete',soakSpanHours:18.0,soakSampleCount:19,
    soakHistory:Array.from({length:19},(_,index)=>({recordedAt:at((18-index)*60),opensearchStatus:'yellow',opensearchStoreBytes:7610000000+index*28824945,consumerLag:index%6===4?120:38,sampleFile:`sample-${String(index+1).padStart(2,'0')}.json`})),limitations:['Measured signals only — no configured pass/fail SLO thresholds','Fixture soak span is fictional and is not staging evidence'],
  },
};
