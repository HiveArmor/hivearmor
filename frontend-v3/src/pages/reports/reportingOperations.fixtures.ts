import type { ReportingInventory } from './reportingOperations.types';

const generatedAt = '2026-08-21T11:58:00.000Z';

export const reportingOperationsFixture: ReportingInventory = {
  reports: [
    { id:'rpt-2401', title:'SOC situation report · Shift B', type:'SITREP', status:'ready', classification:'Internal', scope:'All authorized tenants', period:'Last 8 hours', generatedAt, generatedBy:'Maya Chen', version:4, format:'PDF', evidenceCount:38, incidentCount:7, redactionProfile:'SOC internal', approval:'approved', freshness:'current' },
    { id:'rpt-2400', title:'INC-4821 · Privileged account compromise', type:'INCIDENT', status:'review', classification:'Restricted', scope:'Northwind Financial', period:'03 Aug 2026 · 09:10–13:42', generatedAt:'2026-08-21T11:36:00.000Z', generatedBy:'Hive Intelligence draft', version:2, format:'PDF', evidenceCount:24, incidentCount:1, redactionProfile:'Incident legal review', approval:'pending', freshness:'current' },
    { id:'rpt-2399', title:'August containment after-action review', type:'AFTER_ACTION', status:'generating', classification:'Internal', scope:'Production tenants', period:'01–20 Aug 2026', generatedBy:'Elena Rossi', version:1, format:'PDF', evidenceCount:61, incidentCount:12, redactionProfile:'Leadership summary', approval:'pending', freshness:'current' },
    { id:'rpt-2398', title:'Executive cyber risk brief · Week 33', type:'EXECUTIVE', status:'ready', classification:'Executive', scope:'All authorized tenants', period:'11–17 Aug 2026', generatedAt:'2026-08-18T03:30:00.000Z', generatedBy:'Scheduled delivery', version:3, format:'PDF', evidenceCount:92, incidentCount:19, redactionProfile:'Executive', approval:'approved', freshness:'current' },
    { id:'rpt-2397', title:'SOC situation report · Shift A', type:'SITREP', status:'expired', classification:'Internal', scope:'All authorized tenants', period:'Previous shift', generatedAt:'2026-08-20T03:30:00.000Z', generatedBy:'Scheduled delivery', version:1, format:'PDF', evidenceCount:31, incidentCount:5, redactionProfile:'SOC internal', approval:'approved', freshness:'stale' },
  ],
  schedules: [
    { id:'sch-81', title:'Shift handoff SITREP', type:'SITREP', cadence:'Every 8 hours', timezone:'Asia/Kolkata', recipients:['soc-leads@hivearmor.example','shift-b@hivearmor.example'], channels:['email','archive'], active:true, lastRunAt:generatedAt, nextRunAt:'2026-08-21T19:58:00.000Z', lastDurationMs:18420, deliveryHealth:'healthy', owner:'SOC Operations', runAs:'svc-reporting-soc', format:'PDF' },
    { id:'sch-82', title:'Weekly executive risk brief', type:'EXECUTIVE', cadence:'Monday · 09:00', timezone:'Asia/Kolkata', recipients:['executive-risk@hivearmor.example'], channels:['email','archive'], active:true, lastRunAt:'2026-08-18T03:30:00.000Z', nextRunAt:'2026-08-25T03:30:00.000Z', lastDurationMs:32760, deliveryHealth:'healthy', owner:'CISO Office', runAs:'svc-reporting-exec', format:'PDF' },
    { id:'sch-83', title:'Monthly incident evidence export', type:'INCIDENT', cadence:'1st day · 02:00', timezone:'UTC', recipients:['legal-hold@hivearmor.example'], channels:['archive'], active:true, lastRunAt:'2026-08-01T02:00:00.000Z', nextRunAt:'2026-09-01T02:00:00.000Z', lastDurationMs:91400, deliveryHealth:'warning', owner:'Incident Response', runAs:'svc-reporting-ir', format:'JSON' },
    { id:'sch-84', title:'Legacy compliance digest', type:'COMPLIANCE', cadence:'Friday · 18:00', timezone:'UTC', recipients:['grc@hivearmor.example'], channels:['email'], active:false, lastRunAt:'2026-08-07T18:00:00.000Z', deliveryHealth:'not_configured', owner:'GRC', runAs:'svc-reporting-grc', format:'CSV' },
  ],
  templates: [
    { id:'tpl-11', name:'SOC shift SITREP', type:'SITREP', description:'Operational handoff with incident posture, detection health, queue pressure, and actions due.', version:7, owner:'SOC Operations', managed:true, sections:8, dataSources:6, redactionProfile:'SOC internal', updatedAt:'2026-08-19T08:20:00.000Z', status:'published' },
    { id:'tpl-12', name:'Incident investigation record', type:'INCIDENT', description:'Evidence-backed incident narrative, timeline, containment, impact, and validation record.', version:5, owner:'Incident Response', managed:true, sections:10, dataSources:5, redactionProfile:'Incident legal review', updatedAt:'2026-08-18T12:10:00.000Z', status:'published' },
    { id:'tpl-13', name:'Post-incident review', type:'AFTER_ACTION', description:'Root cause, control gaps, response metrics, lessons learned, and tracked improvement actions.', version:3, owner:'Incident Response', managed:true, sections:9, dataSources:4, redactionProfile:'Leadership summary', updatedAt:'2026-08-15T10:40:00.000Z', status:'published' },
    { id:'tpl-14', name:'Executive cyber risk brief', type:'EXECUTIVE', description:'Concise risk trends, material incidents, exposure changes, and decisions required.', version:2, owner:'CISO Office', managed:false, sections:6, dataSources:7, redactionProfile:'Executive', updatedAt:'2026-08-12T06:20:00.000Z', status:'draft' },
  ],
  total: 13,
  tenantScoped: true,
  bounded: true,
  snapshotAt: generatedAt,
  partial: false,
  warnings: [],
};
