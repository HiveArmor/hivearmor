import type {
  IsolationListQuery,
  IsolationPage,
  IsolatedHostDTO,
  QuarantineListQuery,
  QuarantinePage,
  QuarantinedFileDTO,
} from '@/types/edr';

export const foundationQuarantinedFiles: QuarantinedFileDTO[] = [];
export const foundationIsolatedHosts: IsolatedHostDTO[] = [];

export function getFoundationQuarantinePage(query: QuarantineListQuery): QuarantinePage {
  return { content: [], totalElements: 0, totalPages: 0, number: query.page };
}

export function getFoundationIsolationPage(query: IsolationListQuery): IsolationPage {
  return { content: [], totalElements: 0, totalPages: 0, number: query.page };
}
