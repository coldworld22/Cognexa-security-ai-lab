export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export function getPagination(query: PaginationQuery) {
  const page = Math.max(query.page ?? 1, 1);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}
