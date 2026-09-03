/**
 * Vitest — agent schema v1 builders / parsers (FE-POL-01).
 */

import { describe, expect, it } from 'vitest';

import {
  buildAgentPolicyDocument,
  defaultAgentFimPolicyFormValues,
  formValuesToUtmPolicyDto,
  parseAgentPolicyDocument,
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
  });

  it('round-trips through serialize + utm DTO', () => {
    const form = {
      ...defaultAgentFimPolicyFormValues(),
      policyName: 'Win FIM',
      platform: 'windows',
      fimMode: 'replace' as const,
      rules: [{ path: 'C:\\Windows\\System32', recursive: false, exclude: ['*.log'] }],
      allowShell: true,
    };
    const dto = formValuesToUtmPolicyDto(form);
    expect(dto.policyName).toBe('Win FIM');
    expect(dto.platform).toBe('windows');
    const parsed = JSON.parse(dto.policyConfig ?? '{}') as {
      schema_version: number;
      response: { allow_shell: boolean };
    };
    expect(parsed.schema_version).toBe(1);
    expect(parsed.response.allow_shell).toBe(true);

    const back = utmPolicyToFormValues({
      policyName: dto.policyName,
      policyConfig: dto.policyConfig,
      platform: dto.platform,
      isActive: true,
    } satisfies UtmAgentPolicyDTO);
    expect(back.fimMode).toBe('replace');
    expect(back.allowShell).toBe(true);
    expect(back.rules[0]?.path).toContain('System32');
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
});
