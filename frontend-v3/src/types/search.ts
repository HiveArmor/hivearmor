/**
 * Types for the Search & Hunt feature (Sprint 15).
 * Additional interfaces (SavedHuntDTO, HuntHistoryEntry) will be
 * appended by T05.
 */

export interface TimelineEventDTO {
  id: string;
  timestamp: string; // ISO 8601
  eventType: string;
  severity: number | null;
  dataType: string;
}

export interface HuntUserDTO {
  login: string;
  firstName: string | null;
  lastName: string | null;
}

export interface CreateIncidentFromHuntRequest {
  incidentName: string;
  incidentStatus: number;        // 1 = open
  incidentSeverity: number;      // 1..5
  incidentAssignedTo?: string;   // user login
  evidenceEventIds: string[];    // OpenSearch _id values
}

export interface SavedHuntDTO {
  id: number;
  huntName: string;
  queryDsl: string | null;
  nlQuery: string | null;
  filterJson: string | null;
  createdBy: string;
  createdAt: string;         // ISO 8601
  isShared: boolean;
  lastUsedAt: string | null; // ISO 8601
}

export interface HuntHistoryEntry {
  query: string;
  timestamp: string;  // ISO 8601
  resultCount: number;
}
