// src/features/repair-request/application/use-engineer-repair-request-list.spec.ts

/**
 * 工程师列表 query 状态机单测。
 *
 * 走真实 hook 与真实失效通道，只 mock 外部 GraphQL adapter；
 * 不在测试里重写后端分页 / scope 语义。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type {
  EngineerRepairListScope,
  EngineerRepairRequestListItem,
  EngineerRepairRequestPage,
} from '../infrastructure/engineer-repair-request.types';
import * as engineerRepairRequestAdapter from '../infrastructure/engineer-repair-request-adapter';

import { invalidateEngineerRepairLists } from './engineer-repair-list-refresh';
import { useEngineerRepairRequestList } from './use-engineer-repair-request-list';

vi.mock('../infrastructure/engineer-repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof engineerRepairRequestAdapter>();

  return {
    ...actual,
    fetchEngineerRepairRequests: vi.fn(),
  };
});

const fetchMock = vi.mocked(engineerRepairRequestAdapter.fetchEngineerRepairRequests);

function buildItem(id: number): EngineerRepairRequestListItem {
  return {
    id,
    requestNo: `RR20260902100000ABC${id}`,
    equipmentModel: { id: 3, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
    errorCode: 'E-100',
    createdAt: '2026-09-02T08:00:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
  };
}

function buildPage(
  items: EngineerRepairRequestListItem[],
  page = 1,
  pageSize = 10,
): EngineerRepairRequestPage {
  return { items, total: items.length, page, pageSize };
}

function readyItems(state: unknown): number[] {
  return (state as { items: EngineerRepairRequestListItem[] }).items.map((item) => item.id);
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useEngineerRepairRequestList', () => {
  it('初次挂载即按当前范围第 1 页加载并进入 ready', async () => {
    fetchMock.mockResolvedValue(buildPage([buildItem(21), buildItem(22)]));

    const { result } = renderHook(() => useEngineerRepairRequestList('AVAILABLE'));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith({ scope: 'AVAILABLE', page: 1, pageSize: 10 });
    expect(result.current.state).toEqual({
      status: 'ready',
      requestSeq: 1,
      items: [buildItem(21), buildItem(22)],
      total: 2,
      page: 1,
      pageSize: 10,
    });
  });

  it('切换 AVAILABLE/MINE 时回到第 1 页（不沿用上一范围的页码）', async () => {
    fetchMock.mockResolvedValue(buildPage([]));

    const { result, rerender } = renderHook(
      ({ scope }: { scope: EngineerRepairListScope }) => useEngineerRepairRequestList(scope),
      { initialProps: { scope: 'AVAILABLE' } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.goToPage(3);
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'AVAILABLE', page: 3, pageSize: 10 }),
    );

    rerender({ scope: 'MINE' });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'MINE', page: 1, pageSize: 10 }),
    );
  });

  it('旧请求晚返回时不覆盖新结果', async () => {
    let resolveFirst: (value: EngineerRepairRequestPage) => void = () => {};
    const firstRequest = new Promise<EngineerRepairRequestPage>((resolve) => {
      resolveFirst = resolve;
    });
    fetchMock.mockReturnValueOnce(firstRequest);
    fetchMock.mockResolvedValueOnce(buildPage([buildItem(22)], 2));

    const { result } = renderHook(() => useEngineerRepairRequestList('AVAILABLE'));

    // 第 1 页请求仍在飞时翻到第 2 页
    await act(async () => {
      result.current.goToPage(2);
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(readyItems(result.current.state)).toEqual([22]);

    // 过期的第 1 页结果此时才返回：必须被序号守卫丢弃
    await act(async () => {
      resolveFirst(buildPage([buildItem(21)], 1));
      await firstRequest;
    });

    expect(result.current.state).toMatchObject({ status: 'ready', page: 2 });
    expect(readyItems(result.current.state)).toEqual([22]);
  });

  it('加载失败进入 failed，reload 沿用当前范围与页码', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    fetchMock.mockRejectedValueOnce(networkError);

    const { result } = renderHook(() => useEngineerRepairRequestList('MINE'));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    // 文案直接取共享错误模型的 userMessage，不在本层重写第二套提示
    expect(result.current.state).toMatchObject({
      status: 'failed',
      message: networkError.userMessage,
    });

    fetchMock.mockRejectedValueOnce(networkError);
    await act(async () => {
      result.current.goToPage(2);
    });
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    fetchMock.mockResolvedValueOnce(buildPage([buildItem(31)], 2));
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'MINE', page: 2, pageSize: 10 });
    expect(readyItems(result.current.state)).toEqual([31]);
  });

  it('auth 失败按共享错误模型文案提示，不在本层伪装成业务结果', async () => {
    const authError = new GraphQLIngressError({ type: 'auth', message: 'token invalid' });
    fetchMock.mockRejectedValueOnce(authError);

    const { result } = renderHook(() => useEngineerRepairRequestList('AVAILABLE'));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({ message: authError.userMessage });
    expect(authError.userMessage).toBe('登录状态已失效，请重新登录后再试。');
  });

  it('接单流程宣告列表失效后按当前范围与页码刷新', async () => {
    fetchMock.mockResolvedValue(buildPage([buildItem(21)]));

    const { result } = renderHook(() => useEngineerRepairRequestList('MINE'));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.goToPage(2);
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'MINE', page: 2, pageSize: 10 }),
    );

    await act(async () => {
      invalidateEngineerRepairLists();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'MINE', page: 2, pageSize: 10 });
  });

  it('卸载后取消订阅失效通道，不再触发刷新', async () => {
    fetchMock.mockResolvedValue(buildPage([]));

    const { result, unmount } = renderHook(() => useEngineerRepairRequestList('AVAILABLE'));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    unmount();

    await act(async () => {
      invalidateEngineerRepairLists();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
