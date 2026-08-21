/**
 * buildTreemapData.ts — Pure function that constructs ECharts treemap data
 * from a set of frameworks and a set of active (chip-selected) framework IDs.
 *
 * This function is the source of truth for Property 3 (Treemap Filter Faithfulness):
 * the treemap leaves MUST equal the set of active framework IDs — no extras, no missing.
 */

export interface Framework {
  id: string;
  name: string;
  shortName: string;
  version: string;
  totalControls: number;
  compliantControls: number;
}

export interface TreemapLeaf {
  name: string;
  value: number;
  frameworkId: string;
}

export interface TreemapData {
  name: string;
  children: TreemapLeaf[];
}

/**
 * Builds the ECharts treemap data structure from the active frameworks.
 *
 * Only frameworks whose `id` is in `activeFrameworkIds` appear as leaves.
 * The value of each leaf is `compliantControls` (used for visual sizing).
 *
 * @param frameworks - All available frameworks from the API
 * @param activeFrameworkIds - The set of currently-active chip selections
 * @returns TreemapData with leaves === active frameworks
 */
export function buildTreemapData(
  frameworks: ReadonlyArray<Framework>,
  activeFrameworkIds: ReadonlySet<string>,
): TreemapData {
  const children: TreemapLeaf[] = frameworks
    .filter((fw) => activeFrameworkIds.has(fw.id))
    .map((fw) => ({
      name: fw.shortName,
      value: fw.compliantControls > 0 ? fw.compliantControls : 1,
      frameworkId: fw.id,
    }));

  return {
    name: 'Compliance Coverage',
    children,
  };
}

/**
 * Extracts the set of framework IDs present as treemap leaves.
 * Used by tests to verify filter faithfulness.
 */
export function extractTreemapFrameworkIds(data: TreemapData): Set<string> {
  return new Set(data.children.map((leaf) => leaf.frameworkId));
}
