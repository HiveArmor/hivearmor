/**
 * CompliancePage.treemapFilterFaithfulness.pbt.test.ts
 *
 * Property 3: Treemap Filter Faithfulness
 *
 * For any subset S of AllFrameworks, activating the chips for S and building
 * the treemap produces leaves === S (equal set membership, no extras, no
 * missing entries).
 *
 * Tag: Feature: sprint-30-compliance-packs, Property 3: Treemap Filter Faithfulness
 *
 * **Validates: Requirements 7.5, 7.6**
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buildTreemapData,
  extractTreemapFrameworkIds,
  type Framework,
} from './buildTreemapData';

// ---------------------------------------------------------------------------
// Constants — representative framework IDs matching real compliance packs
// ---------------------------------------------------------------------------

const ALL_FRAMEWORK_IDS: readonly string[] = [
  'NIST-800-53-R5',
  'NIST-800-171-R3',
  'CMMC-L2',
  'FEDRAMP-MODERATE',
  'FISMA',
  'PCI-DSS-V4',
  'SOC2-TSC',
] as const;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generates a Framework object for a given ID with arbitrary but valid field values.
 */
function frameworkForId(id: string): fc.Arbitrary<Framework> {
  return fc.record({
    id: fc.constant(id),
    name: fc.string({ minLength: 1, maxLength: 60 }),
    shortName: fc.string({ minLength: 1, maxLength: 15 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    totalControls: fc.integer({ min: 1, max: 2000 }),
    compliantControls: fc.integer({ min: 0, max: 2000 }),
  });
}

/**
 * Generates the full set of 7 frameworks with unique IDs and an arbitrary
 * subset of those IDs as the "active chips" selection.
 */
const allFrameworksArb: fc.Arbitrary<Framework[]> = fc.tuple(
  ...ALL_FRAMEWORK_IDS.map((id) => frameworkForId(id)),
);

const activeSubsetArb: fc.Arbitrary<string[]> = fc.subarray(
  [...ALL_FRAMEWORK_IDS],
  { minLength: 0, maxLength: ALL_FRAMEWORK_IDS.length },
);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: sprint-30-compliance-packs, Property 3: Treemap Filter Faithfulness', () => {
  it('treemap leaves === active chip set (equal set membership, no extras, no missing)', () => {
    fc.assert(
      fc.property(allFrameworksArb, activeSubsetArb, (frameworks, activeArr) => {
        const activeIds = new Set(activeArr);

        // Act: build treemap data from the frameworks and active selection
        const treemapData = buildTreemapData(frameworks, activeIds);

        // Extract the framework IDs present in the treemap leaves
        const treemapIds = extractTreemapFrameworkIds(treemapData);

        // Assert: treemap leaves === active chip set (exact set equality)
        // No extras
        for (const id of treemapIds) {
          expect(activeIds.has(id)).toBe(true);
        }
        // No missing entries
        for (const id of activeIds) {
          expect(treemapIds.has(id)).toBe(true);
        }
        // Same cardinality
        expect(treemapIds.size).toBe(activeIds.size);
      }),
      { numRuns: 200 },
    );
  });

  it('treemap leaf count equals the size of the active set', () => {
    fc.assert(
      fc.property(allFrameworksArb, activeSubsetArb, (frameworks, activeArr) => {
        const activeIds = new Set(activeArr);
        const treemapData = buildTreemapData(frameworks, activeIds);

        // The number of leaves must equal |S|
        expect(treemapData.children.length).toBe(activeIds.size);
      }),
      { numRuns: 200 },
    );
  });

  it('empty active set produces zero treemap leaves', () => {
    fc.assert(
      fc.property(allFrameworksArb, (frameworks) => {
        const emptySet = new Set<string>();
        const treemapData = buildTreemapData(frameworks, emptySet);

        expect(treemapData.children.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('full active set produces one leaf per framework', () => {
    fc.assert(
      fc.property(allFrameworksArb, (frameworks) => {
        // Activate ALL frameworks
        const allIds = new Set(frameworks.map((fw) => fw.id));
        const treemapData = buildTreemapData(frameworks, allIds);

        expect(treemapData.children.length).toBe(frameworks.length);
        const leafIds = extractTreemapFrameworkIds(treemapData);
        for (const fw of frameworks) {
          expect(leafIds.has(fw.id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
