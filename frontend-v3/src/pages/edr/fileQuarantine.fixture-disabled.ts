import type { QuarantineListQuery, QuarantinePage, QuarantinedFileDTO } from '@/types/edr';

export const foundationQuarantinedFiles: QuarantinedFileDTO[] = [];

export function getFoundationQuarantinePage(query: QuarantineListQuery): QuarantinePage {
  return { content: [], totalElements: 0, totalPages: 0, number: query.page };
}
