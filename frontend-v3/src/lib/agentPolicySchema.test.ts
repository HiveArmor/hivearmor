/**
 * Vitest — agent schema v1 / v1.1 builders / parsers (FE-POL-01 / Next).
 */

import { describe, expect, it } from 'vitest';

import {
  buildAgentPolicyDocument,
  defaultAgentFimPolicyFormValues,
  formHoursOrInvalid,
  formValuesToUtmPolicyDto,
  parseAgentPolicyDocument,
  parseIntervalHours,
  serializeAgentPolicyDocument,
  utmPolicyToFormValues,
  validateAgentFimPolicyForm,
} from '@/lib/agentPolicySchema';
import type { AgentFimPolicyFormValues, UtmAgentPolicyDTO } from '@/types/agentPolicies';

describe('parseAgentPolicyDocument', () => {
  it('returns empty document for blank input', () => {
    expect(parseAgentPolicyDocument('')).toEqual({ schema_version: 0 });
    expect(parseAgentPolicyDocument('   ')).toEqual({ schema_version: 0 });
    expect(parseAgentPolicyDocument(null)).toEqual({ schema_version: 0 });
  });

  it('parses schema v1 FIM + response', () => {
    const raw = JSON.stringify({
      schema_version: 1,
      fim: {
        mode: 'replace',
        rules: [{ path: '/etc', recursive: true, exclude: ['*.tmp'] }],
      },
      collectors: { fim: true, dns: false },
      response: { allow_shell: true },
    });
    const doc = parseAgentPolicyDocument(raw);
    expect(doc.schema_version).toBe(1);
    expect(doc.fim?.mode).toBe('replace');
    expect(doc.fim?.rules).toEqual([
      { path: '/etc', recursive: true, exclude: ['*.tmp'] },
    ]);
    expect(doc.collectors?.dns).toBe(false);
    expect(doc.response?.allow_shell).toBe(true);
  });

  it('parses schema v1.1 telemetry interval hours', () => {
    const doc = parseAgentPolicyDocument(
      JSON.stringify({
        schema_version: 1,
        telemetry: {
          sca_interval_hours: 12,
          sbom_interval_hours: 24,
        },
      }),
    );
    expect(doc.telemetry?.sca_interval_hours).toBe(12);
    expect(doc.telemetry?.sbom_interval_hours).toBe(24);
  });

  it('defaults fim mode to merge when omitted', () => {
    const doc = parseAgentPolicyDocument(
      JSON.stringify({
        schema_version: 1,
        fim: { rules: [{ path: '/bin', recursive: false }] },
      }),
    );
    expect(doc.fim?.mode).toBe('merge');
  });

  it('rejects unsupported schema_version', () => {
    expect(() => parseAgentPolicyDocument('{"schema_version":99}')).toThrow(
      /unsupported policy schema_version/,
    );
  });

  it('rejects invalid JSON', () => {
    expect(() => parseAgentPolicyDocument('{not-json')).toThrow(/not valid JSON/);
  });
});

describe('parseIntervalHours / formHoursOrInvalid', () => {
  it('accepts positive integers', () => {
    expect(parseIntervalHours(6)).toBe(6);
    expect(parseIntervalHours('12')).toBe(12);
    expect(formHoursOrInvalid('6')).toBe(6);
    expect(formHoursOrInvalid('')).toBeNull();
  });

  it('rejects zero, non-integer, and out-of-range', () => {
    expect(parseIntervalHours(0)).toBeUndefined();
    expect(parseIntervalHours(-1)).toBeUndefined();
    expect(formHoursOrInvalid('0')).toBe('invalid');
    expect(formHoursOrInvalid('6.5')).toBe('invalid');
    expect(formHoursOrInvalid('abc')).toBe('invalid');
    expect(formHoursOrInvalid('999')).toBe('invalid');
  });
});

describe('buildAgentPolicyDocument / form mapping', () => {
  it('builds schema v1 and omits empty exclude arrays', () => {
    const form: AgentFimPolicyFormValues = {
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'Linux FIM',
      fimMode: 'merge',
      rules: [
        { path: '/etc', recursive: true, exclude: ['*.tmp', ''] },
        { path: '  ', recursive: true, exclude: [] },
        { path: '/var/log', recursive: false, exclude: [] },
      ],
      allowShell: false,
      collectors: { fim: true, dns: false },
    };
    const doc = buildAgentPolicyDocument(form);
    expect(doc.schema_version).toBe(1);
    expect(doc.fim?.mode).toBe('merge');
    expect(doc.fim?.rules).toEqual([
      { path: '/etc', recursive: true, exclude: ['*.tmp'] },
      { path: '/var/log', recursive: false },
    ]);
    expect(doc.response?.allow_shell).toBe(false);
    expect(doc.collectors?.dns).toBe(false);
    expect(doc.telemetry).toBeUndefined();
  });

  it('includes telemetry.sca_interval_hours and sbom_interval_hours when set', () => {
    const form: AgentFimPolicyFormValues = {
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'Telemetry',
      rules: [{ path: '/etc', recursive: true }],
      scaIntervalHours: '12',
      sbomIntervalHours: '24',
    };
    const doc = buildAgentPolicyDocument(form);
    expect(doc.schema_version).toBe(1);
    expect(doc.telemetry).toEqual({
      sca_interval_hours: 12,
      sbom_interval_hours: 24,
    });
  });

  it('round-trips through serialize + utm DTO including telemetry', () => {
    const form = {
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'Win FIM',
      platform: 'windows',
      fimMode: 'replace' as const,
      rules: [{ path: 'C:\\Windows\\System32', recursive: false, exclude: ['*.log'] }],
      allowShell: true,
      scaIntervalHours: '8',
      sbomIntervalHours: '8',
    };
    const dto = formValuesToUtmPolicyDto(form);
    expect(dto.policyName).toBe('Win FIM');
    expect(dto.platform).toBe('windows');
    const parsed = JSON.parse(dto.policyConfig ?? '{}') as {
      schema_version: number;
      response: { allow_shell: boolean };
      telemetry: { sca_interval_hours: number; sbom_interval_hours: number };
    };
    expect(parsed.schema_version).toBe(1);
    expect(parsed.response.allow_shell).toBe(true);
    expect(parsed.telemetry.sca_interval_hours).toBe(8);
    expect(parsed.telemetry.sbom_interval_hours).toBe(8);

    const back = utmPolicyToFormValues({
      policyName: dto.policyName,
      policyConfig: dto.policyConfig,
      platform: dto.platform,
      isActive: true,
    } satisfies UtmAgentPolicyDTO);
    expect(back.fimMode).toBe('replace');
    expect(back.allowShell).toBe(true);
    expect(back.rules[0]?.path).toContain('System32');
    expect(back.scaIntervalHours).toBe('8');
    expect(back.sbomIntervalHours).toBe('8');
  });

  it('serializeAgentPolicyDocument produces parseable JSON', () => {
    const doc = buildAgentPolicyDocument({
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'x',
      rules: [{ path: '/etc', recursive: true }],
    });
    expect(parseAgentPolicyDocument(serializeAgentPolicyDocument(doc)).fim?.rules?.[0]?.path).toBe(
      '/etc',
    );
  });
});

describe('validateAgentFimPolicyForm', () => {
  it('requires name and at least one path', () => {
    const errors = validateAgentFimPolicyForm(defaultAgentFimPolicyFormValues());
    expect(errors).toContain('Policy name is required');
    expect(errors).toContain('Add at least one FIM include path');
  });

  it('passes a minimal valid form', () => {
    const errors = validateAgentFimPolicyForm({
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'ok',
      rules: [{ path: '/etc', recursive: true }],
    });
    expect(errors).toEqual([]);
  });

  it('rejects invalid telemetry intervals', () => {
    const errors = validateAgentFimPolicyForm({
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'ok',
      rules: [{ path: '/etc', recursive: true }],
      scaIntervalHours: '0',
      sbomIntervalHours: 'nope',
    });
    expect(errors.some((e) => e.includes('SCA interval'))).toBe(true);
    expect(errors.some((e) => e.includes('SBOM interval'))).toBe(true);
  });
});
