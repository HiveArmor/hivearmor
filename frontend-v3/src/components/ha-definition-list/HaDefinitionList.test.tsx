import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { HaDefinitionList } from './HaDefinitionList';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('HaDefinitionList — conventions', () => {
  it('files exist + export', () => {
    expect(existsSync(join(__dirname, 'HaDefinitionList.tsx'))).toBe(true);
    expect(existsSync(join(__dirname, 'HaDefinitionList.css'))).toBe(true);
    expect(typeof HaDefinitionList).toBe('function');
  });

  it('no hardcoded hex in component or css', () => {
    const tsx = readFileSync(join(__dirname, 'HaDefinitionList.tsx'), 'utf-8');
    const css = readFileSync(join(__dirname, 'HaDefinitionList.css'), 'utf-8');
    expect(tsx.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/)).toBeFalsy();
  });
});

describe('HaDefinitionList — render', () => {
  it('renders term/value pairs', () => {
    render(
      <HaDefinitionList
        items={[
          { term: 'IP Address', value: '10.0.0.1', mono: true },
          { term: 'Hostname', value: 'HOST-1000', mono: true },
        ]}
      />,
    );
    expect(screen.getByText('IP Address')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('Hostname')).toBeInTheDocument();
  });

  it('skips empty/nullish values', () => {
    render(
      <HaDefinitionList
        items={[
          { term: 'Present', value: 'yes' },
          { term: 'Empty', value: '' },
          { term: 'Null', value: null },
        ]}
      />,
    );
    expect(screen.getByText('Present')).toBeInTheDocument();
    expect(screen.queryByText('Empty')).not.toBeInTheDocument();
    expect(screen.queryByText('Null')).not.toBeInTheDocument();
  });

  it('applies mono class only to mono items', () => {
    const { container } = render(
      <HaDefinitionList
        items={[
          { term: 'Hash', value: 'abc', mono: true },
          { term: 'Note', value: 'plain' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.ha-dl__value--mono')).toHaveLength(1);
  });
});
