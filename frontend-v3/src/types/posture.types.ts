/**
 * posture.types.ts — Security Posture types
 */

export interface HivePostureScoreDTO {
  overallScore: number; // 0-100
  totalFrameworks: number;
  controlsPassed: number;
  controlsFailed: number;
  controlsTotal: number;
  lastAssessed: string | null; // ISO 8601
  trend: 'improving' | 'declining' | 'stable';
}

export interface HiveFrameworkScoreDTO {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  controlCount: number;
  overallScore: number; // 0-100
  lastAssessed: string | null; // ISO 8601
}
