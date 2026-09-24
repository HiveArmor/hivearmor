/**
 * Vitest — PT-2 policy-template schema: full multi-tab build → policyConfig →
 * parse round-trip, per-section shapes, FIM byte-identity, and validation.
 */

import { describe, expect, it } from 'vitest';

import {
  buildTemplateEnvelope,
  buildTemplatePolicyConfig,
  defaultPolicyTemplateForm,
  formToTemplateUpdateDto,
  templateDtoToForm,
  validatePolicyTemplateForm,
} from '@/lib/policyTemplateSchema';
import type { UtmAgentPolicyDTO } from '@/types/agentPolicies';
import type { PolicyTemplateFormValues } from '@/types/policyTemplates';

function fullForm(): PolicyTemplateFormValues {
  const f = defaultPolicyTemplateForm();
  f.name = 'Windows Server Baseline';
  f.description = 'Full multi-tab template';
  f.scope = 'ORG';
  f.platform = 'windows';
  f.monitor = { items: [{ metric: 'cpu.percent', intervalSec: '60' }, { metric: 'mem.free', intervalSec: '' }] };
  f.event = {
    fileLogIis: true,
    fileLogDhcp: false,
    eventLogs: [
      { type: 'Security', channel: '', include: '4624,4625', exclude: 'NONE' },
      { type: 'Other', channel: 'Microsoft-Windows-Sysmon/Operational', include: 'ALL', exclude: '' },
    ],
  };
  f.ueba = { enabled: true };
  f.userLog = [
    { fullFileName: 'C:\\logs\\app.log', logPrefix: 'app', multilineStart: '^\\d{4}', multilineEnd: '', multilineMaxLines: '50' },
  ];
  f.fim = {
    mode: 'replace',
    rules: [
      { path: 'C:\\Windows\\System32', recursive: true, exclude: ['*.tmp', '*.log'] },
      { path: 'C:\\inetpub', recursive: false, exclude: [] },
    ],
  };
  f.change = {
    registry: [{ rootKey: 'HKLM\\SOFTWARE', excludeSubkeys: 'Microsoft, Classes' }],
    installedSoftware: true,
  };
  f.script = { wmi: ['Win32_Process'], powershell: ['Get-Service'] };
  f.certificate = [{ store: 'My', add: true, delete: false, expiring: true, expired: true }];
  f.osquery = { queries: ['q_processes', 'q_users'] };
  f.scans = {
    cis: { enabled: true, profile: 'CIS_Windows_2022_L1', mode: 'scheduled', cronOrInterval: '0 3 * * *', source: 'agent' },
    vuln: { enabled: true, profile: '', mode: 'realtime', cronOrInterval: '', source: 'agent' },
  };
  f.collectors = { fim: true, dns: false, netconn: true, usb: true, netflow: true, syslog: true, file: true };
  f.allowShell = true;
  f.scaIntervalHours = '12';
  f.sbomIntervalHours = '24';
  return f;
}

describe('buildTemplateEnvelope', () => {
  it('emits schema_version 1 + metadata + flat sections', () => {
    const env = buildTemplateEnvelope(fullForm());
    expect(env.schema_version).toBe(1);
    expect(env.name).toBe('Windows Server Baseline');
    expect(env.scope).toBe('ORG');
    expect(env.platform).toBe('windows');
    expect(env.description).toBe('Full multi-tab template');
    // sections are flat at the top level
    expect(env.monitor).toBeDefined();
    expect(env.event).toBeDefined();
    expect(env.scans).toBeDefined();
    expect(env.fim).toBeDefined();
  });

  it('omits empty sections rather than writing no-op keys', () => {
    const env = buildTemplateEnvelope(defaultPolicyTemplateForm());
    expect(env.monitor).toBeUndefined();
    expect(env.event).toBeUndefined();
    expect(env.ueba).toBeUndefined();
    expect(env.scans).toBeUndefined();
    // FIM is always present (enforced core)
    expect(env.fim).toBeDefined();
  });

  it('drops an unnamed monitor interval and keeps a valid one', () => {
    const env = buildTemplateEnvelope(fullForm());
    const items = (env.monitor as { items: Array<{ metric: string; intervalSec?: number }> }).items;
    expect(items[0]).toEqual({ metric: 'cpu.percent', intervalSec: 60 });
    expect(items[1]).toEqual({ metric: 'mem.free' });
  });

  it('normalizes include/exclude ALL/NONE/list', () => {
    const env = buildTemplateEnvelope(fullForm());
    const logs = (env.event as { eventLogs: Array<Record<string, unknown>> }).eventLogs;
    expect(logs[0].include).toEqual(['4624', '4625']);
    expect(logs[0].exclude).toBe('NONE');
    expect(logs[1].include).toBe('ALL');
    expect(logs[1].channel).toBe('Microsoft-Windows-Sysmon/Operational');
  });

  it('omits cronOrInterval for realtime scans, keeps it for scheduled', () => {
    const env = buildTemplateEnvelope(fullForm());
    const scans = env.scans as { cis: Record<string, unknown>; vuln: Record<string, unknown> };
    expect(scans.cis.cronOrInterval).toBe('0 3 * * *');
    expect(scans.vuln.cronOrInterval).toBeUndefined();
    expect(scans.vuln.mode).toBe('realtime');
  });
});

describe('policyConfig round-trip', () => {
  it('build → parse restores every section', () => {
    const original = fullForm();
    const dto: UtmAgentPolicyDTO = {
      id: 7,
      policyName: original.name,
      description: original.description,
      platform: 'windows',
      versionNum: 3,
      policyConfig: buildTemplatePolicyConfig(original),
    };
    const parsed = templateDtoToForm(dto);

    expect(parsed.name).toBe(original.name);
    expect(parsed.platform).toBe('windows');
    expect(parsed.version).toBe(3);
    expect(parsed.monitor.items[0]).toEqual({ metric: 'cpu.percent', intervalSec: '60' });
    expect(parsed.event.fileLogIis).toBe(true);
    expect(parsed.event.eventLogs[0].include).toBe('4624, 4625');
    expect(parsed.ueba.enabled).toBe(true);
    expect(parsed.userLog[0].fullFileName).toBe('C:\\logs\\app.log');
    expect(parsed.userLog[0].multilineMaxLines).toBe('50');
    expect(parsed.fim.mode).toBe('replace');
    expect(parsed.fim.rules).toHaveLength(2);
    expect(parsed.fim.rules[0].exclude).toEqual(['*.tmp', '*.log']);
    expect(parsed.change.installedSoftware).toBe(true);
    expect(parsed.change.registry[0].rootKey).toBe('HKLM\\SOFTWARE');
    expect(parsed.script.wmi).toEqual(['Win32_Process']);
    expect(parsed.certificate[0].store).toBe('My');
    expect(parsed.osquery.queries).toEqual(['q_processes', 'q_users']);
    expect(parsed.scans.cis.enabled).toBe(true);
    expect(parsed.scans.cis.cronOrInterval).toBe('0 3 * * *');
    expect(parsed.scans.vuln.mode).toBe('realtime');
    expect(parsed.collectors.dns).toBe(false);
    expect(parsed.allowShell).toBe(true);
    expect(parsed.scaIntervalHours).toBe('12');
    expect(parsed.sbomIntervalHours).toBe('24');
  });

  it('FIM rules round-trip byte-identically in the wire object form', () => {
    const form = fullForm();
    const cfg = JSON.parse(buildTemplatePolicyConfig(form)) as { fim: unknown };
    expect(cfg.fim).toEqual({
      mode: 'replace',
      rules: [
        { path: 'C:\\Windows\\System32', recursive: true, exclude: ['*.tmp', '*.log'] },
        { path: 'C:\\inetpub', recursive: false },
      ],
    });
  });

  it('accepts the optional `sections` wrapper the schema permits', () => {
    const cfg = JSON.stringify({ schema_version: 1, sections: { ueba: { enabled: true } }, fim: { mode: 'merge', rules: [] } });
    const parsed = templateDtoToForm({ policyName: 'x', policyConfig: cfg });
    expect(parsed.ueba.enabled).toBe(true);
  });
});

describe('formToTemplateUpdateDto', () => {
  it('maps platform "any" to backend "all" and carries policyConfig', () => {
    const f = defaultPolicyTemplateForm();
    f.name = 'T';
    const dto = formToTemplateUpdateDto(f);
    expect(dto.platform).toBe('all');
    expect(dto.policyName).toBe('T');
    expect(typeof dto.policyConfig).toBe('string');
  });
});

describe('validatePolicyTemplateForm', () => {
  it('requires a name', () => {
    expect(validatePolicyTemplateForm(defaultPolicyTemplateForm())).toContain('Template name is required');
  });

  it('requires a cron when a scan is scheduled+enabled', () => {
    const f = defaultPolicyTemplateForm();
    f.name = 'T';
    f.scans.cis = { enabled: true, profile: '', mode: 'scheduled', cronOrInterval: '', source: 'agent' };
    expect(validatePolicyTemplateForm(f).some((e) => e.includes('CIS scan is scheduled'))).toBe(true);
  });

  it('rejects an out-of-range monitor interval', () => {
    const f = defaultPolicyTemplateForm();
    f.name = 'T';
    f.monitor.items = [{ metric: 'x', intervalSec: '1' }];
    expect(validatePolicyTemplateForm(f).some((e) => e.includes('5–86400'))).toBe(true);
  });

  it('passes a valid full form', () => {
    expect(validatePolicyTemplateForm(fullForm())).toEqual([]);
  });
});
