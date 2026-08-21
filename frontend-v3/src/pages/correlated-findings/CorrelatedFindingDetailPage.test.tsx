import { fireEvent, render } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { getFoundationCorrelatedFinding } from './correlatedFindings.fixtures';
import { FindingWorkbench } from './FindingWorkbench';

function heroFinding() {
  const finding = getFoundationCorrelatedFinding('FND-26-0841');
  if (!finding) throw new Error('Hero finding fixture unavailable');
  return finding;
}

describe('Correlated Finding investigation integrity', () => {
  it('keeps every relationship edge attached to an available node', () => {
    const finding = heroFinding();
    const nodeIds = new Set(finding.relationshipNodes.map((node) => node.id));
    expect(finding.relationshipEdges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
  });

  it('keeps chronological stages ordered and linked to supporting alerts', () => {
    const finding = heroFinding();
    expect(finding.stages.map((stage) => stage.order)).toEqual([1, 2, 3, 4]);
    expect(finding.stages.every((stage) => stage.alertIds.length > 0)).toBe(true);
    expect(finding.stages.map((stage) => new Date(stage.detectedAt).getTime())).toEqual(
      [...finding.stages].sort((left, right) => new Date(left.detectedAt).getTime() - new Date(right.detectedAt).getTime()).map((stage) => new Date(stage.detectedAt).getTime())
    );
  });

  it('moves between story, evidence, and relationship views without losing context', () => {
    const { getByRole } = render(<MemoryRouter><FindingWorkbench finding={heroFinding()} compact /></MemoryRouter>);
    expect(getByRole('heading', { name: 'What the correlation means' })).toBeInTheDocument();
    fireEvent.click(getByRole('tab', { name: /Evidence/ }));
    expect(getByRole('table', { name: 'Correlated alerts' })).toBeInTheDocument();
    fireEvent.click(getByRole('tab', { name: /Relationships/ }));
    expect(getByRole('img', { name: /Relationship map/ })).toBeInTheDocument();
  });

  it('has no serious or critical WCAG violations in the default attack story', async () => {
    const { container } = render(<MemoryRouter><FindingWorkbench finding={heroFinding()} compact /></MemoryRouter>);
    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = result.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map(({ id, impact, help }) => ({ id, impact, help }))).toEqual([]);
  });
});
