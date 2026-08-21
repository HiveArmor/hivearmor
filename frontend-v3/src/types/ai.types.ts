/**
 * AI Chat — shared TypeScript types (Sprint 25).
 * Zero `any` types. All enumerations use union literals.
 */

export type AiMessageRole = 'user' | 'assistant' | 'system';
export type AiContextType = 'alert' | 'incident' | 'general';
export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AiChatMessage {
  role: AiMessageRole;
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  contextType: AiContextType;
  contextId?: string;
}

export interface AiChatHistoryEntry {
  id: number;
  userLogin: string;
  contextType: AiContextType;
  contextId: string | null;
  messages: AiChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiChatStreamEvent {
  delta: string;
  done: boolean;
  totalTokens?: number;
}

export interface AiTriageResult {
  summary: string;
}

export interface AiStatusResponse {
  configured: boolean;
  provider: string | null;
}

export interface AiIncidentSummary {
  narrative: string;
  threatActorType: string;
  recommendedSteps: string[];
  riskLevel: AiRiskLevel;
}
