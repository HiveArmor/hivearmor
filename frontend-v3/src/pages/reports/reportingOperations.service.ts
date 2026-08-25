import type { OperationalReport, OperationalReportType, ReportSchedule, ReportingInventory } from './reportingOperations.types';
import { fetchReportsByType, fetchScheduledReports } from './reports.service';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

function normalizeType(value: string): OperationalReportType {
  if (value === 'INCIDENT' || value === 'AFTER_ACTION' || value === 'SITREP' || value === 'COMPLIANCE' || value === 'EXECUTIVE') return value;
  return 'SITREP';
}

async function listLive(): Promise<ReportingInventory> {
  const [reportsResult, schedulesResult] = await Promise.allSettled([fetchReportsByType(), fetchScheduledReports()]);
  if (reportsResult.status === 'rejected' && schedulesResult.status === 'rejected') throw new Error('The reporting inventory endpoints are unavailable.');
  const reports: OperationalReport[] = reportsResult.status === 'fulfilled' ? reportsResult.value.map((item) => ({
    id:String(item.id), title:item.repName, type:normalizeType(item.repType), status:item.repUrl?'ready':'review', classification:'Not reported', scope:'Authorized tenant scope not reported by legacy API', period:'Snapshot period not reported', generatedAt:item.modificationDate??item.creationDate, generatedBy:item.modificationUser??item.creationUser??'Not reported', version:1, format:'Not reported', evidenceCount:0, incidentCount:0, redactionProfile:'Not reported', approval:'Not reported', freshness:'unknown',
  })) : [];
  const schedules: ReportSchedule[] = schedulesResult.status === 'fulfilled' ? schedulesResult.value.map((item) => ({
    id:String(item.id), title:item.name, type:normalizeType(item.type), cadence:item.schedule, timezone:'Not reported', recipients:item.recipients, channels:['email'], active:item.active, lastRunAt:item.lastRun??undefined, nextRunAt:item.nextRun??undefined, deliveryHealth:'not_configured', owner:'Not reported', runAs:'Not reported', format:item.format,
  })) : [];
  const warnings=[reportsResult.status==='rejected'?'Generated reports unavailable':'',schedulesResult.status==='rejected'?'Schedules unavailable':''].filter(Boolean);
  return { reports, schedules, templates:[], total:reports.length+schedules.length, tenantScoped:false, bounded:false, snapshotAt:new Date().toISOString(), partial:warnings.length>0, warnings };
}

export const reportingOperationsService = {
  fixtureMode,
  async list(): Promise<ReportingInventory> {
    if (fixtureMode) {
      const { reportingOperationsFixture } = await import('./reportingOperations.fixtures');
      return structuredClone(reportingOperationsFixture);
    }
    return listLive();
  },
};
