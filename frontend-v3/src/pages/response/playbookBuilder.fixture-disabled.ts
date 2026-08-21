import type { Edge, Node } from 'reactflow';

import type { AiPlaybookRecommendation, PlaybookNodeData } from './playbookNodes.types';

/** Production replacement: fixture records are excluded from the bundle. */
export const fixturePlaybookMetadata = { name: '', description: '', triggerType: 'manual' as const };
export const fixtureAiRecommendations: AiPlaybookRecommendation[] = [];

export function fixturePlaybookGraph(): { nodes: Array<Node<PlaybookNodeData>>; edges: Edge[] } {
  return { nodes: [], edges: [] };
}
