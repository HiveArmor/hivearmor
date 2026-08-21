import type { PlaybookStepType, PlaybookTriggerType } from '@/types/playbook';

export type PlaybookNodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'approval'
  | 'delay'
  | 'loop'
  | 'parallel'
  | 'subplaybook'
  | 'transform'
  | 'intelligence'
  | 'end';

export type PlaybookRisk = 'none' | 'low' | 'medium' | 'high';

export interface PlaybookNodeData {
  label: string;
  nodeType: PlaybookNodeType;
  description: string;
  configured: boolean;
  actionId?: string;
  actionCategory?: string;
  risk?: PlaybookRisk;
  triggerType?: PlaybookTriggerType;
  config: Record<string, unknown>;
}

export interface PaletteNodeDefinition {
  id: string;
  nodeType: Exclude<PlaybookNodeType, 'trigger' | 'end'>;
  label: string;
  description: string;
  category: string;
  risk: PlaybookRisk;
  actionId?: string;
}

export interface AiPlaybookRecommendation {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  confidence: number;
  risk: PlaybookRisk;
  definition: PaletteNodeDefinition;
  reviewPoints: string[];
}

export const TYPE_LABELS: Record<PlaybookNodeType, string> = {
  trigger: 'Trigger',
  action: 'Action',
  condition: 'Decision',
  approval: 'Approval',
  delay: 'Wait',
  loop: 'For each',
  parallel: 'Parallel',
  subplaybook: 'Sub-playbook',
  transform: 'Transform',
  intelligence: 'Hive Intelligence',
  end: 'Outcome',
};

export const STEP_NODE_TYPES: Record<PlaybookStepType, PlaybookNodeType> = {
  action: 'action',
  condition: 'condition',
  delay: 'delay',
  loop: 'loop',
};
