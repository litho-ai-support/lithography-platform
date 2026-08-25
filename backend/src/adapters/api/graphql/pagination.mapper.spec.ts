import { GqlPaginationMode, GqlSortDirection } from './pagination.enums';
import { mapGqlToCoreParams } from './pagination.mapper';
import type { PaginationArgs } from './pagination.args';

describe('GraphQL pagination mapper', () => {
  it('OFFSET 模式应映射默认 page/pageSize、withTotal 和排序方向', () => {
    const input: PaginationArgs = {
      mode: GqlPaginationMode.OFFSET,
      sorts: [
        { field: 'createdAt', direction: GqlSortDirection.DESC },
        { field: 'id', direction: GqlSortDirection.ASC },
      ],
    };

    expect(mapGqlToCoreParams(input)).toEqual({
      mode: 'OFFSET',
      page: 1,
      pageSize: 20,
      sorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'id', direction: 'ASC' },
      ],
      withTotal: false,
    });
  });

  it('OFFSET 模式应保留显式 page/pageSize/withTotal', () => {
    const input: PaginationArgs = {
      mode: GqlPaginationMode.OFFSET,
      page: 3,
      pageSize: 15,
      withTotal: true,
    };

    expect(mapGqlToCoreParams(input)).toEqual({
      mode: 'OFFSET',
      page: 3,
      pageSize: 15,
      sorts: undefined,
      withTotal: true,
    });
  });

  it('CURSOR 模式应映射默认 limit、after 和排序方向', () => {
    const input: PaginationArgs = {
      mode: GqlPaginationMode.CURSOR,
      after: 'cursor-1',
      sorts: [{ field: 'createdAt', direction: GqlSortDirection.DESC }],
    };

    expect(mapGqlToCoreParams(input)).toEqual({
      mode: 'CURSOR',
      limit: 20,
      after: 'cursor-1',
      sorts: [{ field: 'createdAt', direction: 'DESC' }],
    });
  });
});
