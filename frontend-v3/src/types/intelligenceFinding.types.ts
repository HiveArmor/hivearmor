/**
 * intelligenceFinding.types.ts — HI-04/HI-05 structured findings
 * STAGING CANDIDATE — facts vs inference separation is mandatory in UI.
 */

export interface IntelligenceFactDTO {
  id?: number;
  text: string;
  source?: string | null;
}

export interface IntelligenceInferenceDTO {
  id?: number;
  text: string;
  confidence?: number | null;
}

export interface IntelligenceFindingDTO {
  id?: number;
  title?: string | null;
  summary?: string | null;
  answer?: string | null;
  facts: IntelligenceFactDTO[];
  inferences: IntelligenceInferenceDTO[];
  contradictions: IntelligenceInferenceDTO[];
  missingEvidence: string[];
  confidence: number;
  confidenceExplanation?: string | null;
  sources: string[];
  provenance?: string | null;
  contextType?: string | null;
  contextRef?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface IntelligenceFindingFeedbackRequest {
  rating: 'helpful' | 'not_helpful';
  comment?: string;
}

export type IntelligenceFindingListResponse = IntelligenceFindingDTO[];
