import type { Playbook, PlaybookExecution } from '@/types/playbook';

/** Production-safe replacement. Fixture playbook records are never bundled. */
export const fixturePlaybooks: Playbook[] = [];
export const fixturePlaybookExecutions: PlaybookExecution[] = [];
