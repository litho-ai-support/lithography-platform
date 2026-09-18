// src/features/admin-document-database/application/use-admin-document-stats.spec.ts
// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type { AdminDocumentDatabaseStats } from '../infrastructure/admin-document-database.types';

// hook 以相对路径 import adapter：mock 必须落在 adapter 模块路径上（barrel 拦截不到）。
vi.mock(
  '@/features/admin-document-database/infrastructure/admin-document-database-adapter',
  async (importOriginal) => {
    type AdminAdapter =
      typeof import('@/features/admin-document-database/infrastructure/admin-document-database-adapter');
    const actual = await importOriginal<AdminAdapter>();

    return {
      ...actual,
      fetchAdminDocumentDatabaseStats: vi.fn(),
    };
  },
);

import { fetchAdminDocumentDatabaseStats } from '../infrastructure/admin-document-database-adapter';

import { useAdminDocumentStats } from './use-admin-document-stats';

const mockFetchStats = vi.mocked(fetchAdminDocumentDatabaseStats);

/**
 * PR3 S5：页头统计 hook 单测（loading / ready / failed 三态 × 时序）。
 *
 * 覆盖：初次挂载即取数并进入 ready、GraphQLIngressError 用统一用户文案、
 * 非 GraphQL 错误用兜底文案、reload 重新取数并恢复。统计是页头一次性读取，
 * 失败不阻断列表，但必须给出可重试的失败态。
 */
const STATS: AdminDocumentDatabaseStats = {
  repairRequestTotal: 4,
  referenceDocumentTotal: 3,
  aiConversationTotal: 2,
  aiReportTotal: 5,
};

beforeEach(() => {
  mockFetchStats.mockReset();
});

describe('useAdminDocumentStats', () => {
  it('挂载即取数：成功进入 ready，四类总数原样透出', async () => {
    mockFetchStats.mockResolvedValue(STATS);
    const { result } = renderHook(() => useAdminDocumentStats());

    // 取数在途：先呈现 loading
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.stats).toEqual(STATS);
    expect(mockFetchStats).toHaveBeenCalledTimes(1);
  });

  it('GraphQLIngressError 失败：透出统一用户文案，非内部细节', async () => {
    mockFetchStats.mockRejectedValue(
      new GraphQLIngressError({ type: 'network', message: '底层堆栈不应外泄' }),
    );
    const { result } = renderHook(() => useAdminDocumentStats());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('网络连接异常，请稍后重试。');
    expect(result.current.state.message).not.toContain('底层堆栈');
  });

  it('非 GraphQL 错误失败：回落固定兜底文案', async () => {
    mockFetchStats.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAdminDocumentStats());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('统计数据加载失败，请稍后重试。');
  });

  it('reload 重新取数并从 failed 恢复 ready', async () => {
    mockFetchStats.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(STATS);
    const { result } = renderHook(() => useAdminDocumentStats());

    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(mockFetchStats).toHaveBeenCalledTimes(2);
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.stats).toEqual(STATS);
  });
});
