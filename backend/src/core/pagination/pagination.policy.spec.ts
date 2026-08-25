import type { PaginationParams, SortParam } from './pagination.types';
import { applyDefaults, enforceMaxPageSize, whitelistSorts } from './pagination.policy';

describe('pagination policy', () => {
  it('OFFSET 默认值应修正页码、页大小并应用默认排序', () => {
    const input: PaginationParams = {
      mode: 'OFFSET',
      page: 0,
      pageSize: 0,
    };

    expect(
      applyDefaults(input, {
        pageSize: 50,
        sorts: [{ field: 'createdAt', direction: 'DESC' }],
      }),
    ).toEqual({
      mode: 'OFFSET',
      page: 1,
      pageSize: 1,
      sorts: [{ field: 'createdAt', direction: 'DESC' }],
    });
  });

  it('CURSOR 默认值应修正 limit 并让最后出现的同字段排序覆盖前者', () => {
    const input: PaginationParams = {
      mode: 'CURSOR',
      limit: 0,
      sorts: [
        { field: 'createdAt', direction: 'DESC' },
        { field: 'id', direction: 'ASC' },
        { field: 'createdAt', direction: 'ASC' },
      ],
    };

    expect(applyDefaults(input, { limit: 20 })).toEqual({
      mode: 'CURSOR',
      limit: 1,
      sorts: [
        { field: 'id', direction: 'ASC' },
        { field: 'createdAt', direction: 'ASC' },
      ],
    });
  });

  it('enforceMaxPageSize 应同时约束 OFFSET 和 CURSOR', () => {
    expect(
      enforceMaxPageSize(
        {
          mode: 'OFFSET',
          page: -10,
          pageSize: 1000,
        },
        100,
      ),
    ).toEqual({
      mode: 'OFFSET',
      page: 1,
      pageSize: 100,
    });

    expect(
      enforceMaxPageSize(
        {
          mode: 'CURSOR',
          limit: 1000,
        },
        50,
      ),
    ).toEqual({
      mode: 'CURSOR',
      limit: 50,
    });
  });

  it('whitelistSorts 应过滤非白名单字段并按最后同字段排序去重', () => {
    const sorts: SortParam[] = [
      { field: 'createdAt', direction: 'DESC' },
      { field: 'unsafeField', direction: 'ASC' },
      { field: 'id', direction: 'DESC' },
      { field: 'createdAt', direction: 'ASC' },
    ];

    expect(whitelistSorts(sorts, ['createdAt', 'id'])).toEqual([
      { field: 'id', direction: 'DESC' },
      { field: 'createdAt', direction: 'ASC' },
    ]);
  });
});
