// src/features/admin-document-database/application/use-admin-document-list.spec.ts
// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import { useAdminDocumentList } from './use-admin-document-list';

/**
 * PR3 S4：管理员列表状态机 hook 单测（计划表 S4.4 前端项）。
 *
 * 覆盖：初次加载、翻页、筛选变化回第 1 页、requestSeq 竞态防护
 * （晚到的旧页响应不得覆盖新页）、失败消息与重试、enabled 门控。
 */
function makePage<T>(items: T[], page: number, total = 20) {
  return { items, total, page, pageSize: 10 };
}

describe('useAdminDocumentList', () => {
  it('初次加载进入 ready：items / total / page 来自 fetcher 真实返回', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePage(['a', 'b'], 1, 2));
    const { result } = renderHook(() => useAdminDocumentList(fetcher, 'key-1'));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledWith(1, 10);
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.items).toEqual(['a', 'b']);
    expect(result.current.state.total).toBe(2);
  });

  it('goToPage(2) 以相同 pageSize 请求第 2 页', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePage(['p2'], 2));
    const { result } = renderHook(() => useAdminDocumentList(fetcher, 'key-1'));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      result.current.goToPage(2);
    });

    expect(fetcher).toHaveBeenLastCalledWith(2, 10);
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.page).toBe(2);
    expect(result.current.state.items).toEqual(['p2']);
  });

  it('reloadKey 变化回到第 1 页；晚到的旧页响应被 requestSeq 竞态防护丢弃', async () => {
    let resolvePage2: (value: ReturnType<typeof makePage<string>>) => void = () => {};
    const fetcher = vi.fn((page: number) => {
      if (page === 2) {
        return new Promise<ReturnType<typeof makePage<string>>>((resolve) => {
          resolvePage2 = resolve;
        });
      }
      return Promise.resolve(makePage(['page-1'], 1, 20));
    });
    const { result, rerender } = renderHook(
      ({ reloadKey }: { reloadKey: string }) => useAdminDocumentList(fetcher, reloadKey),
      { initialProps: { reloadKey: 'filter-a' } },
    );

    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // 翻到第 2 页（响应挂起），随后筛选变化触发回第 1 页
    await act(async () => {
      result.current.goToPage(2);
    });
    rerender({ reloadKey: 'filter-b' });
    await waitFor(() => expect(fetcher).toHaveBeenNthCalledWith(3, 1, 10));

    // 旧的第 2 页响应最后才到达：不得覆盖第 1 页数据
    await act(async () => {
      resolvePage2(makePage(['stale-page-2'], 2, 20));
    });

    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.page).toBe(1);
    expect(result.current.state.items).toEqual(['page-1']);
  });

  it('fetcher 失败进入 failed：GraphQLIngressError 用统一用户文案，普通错误用兜底文案', async () => {
    const ingressError = new GraphQLIngressError({
      type: 'network',
      message: '内部细节',
    });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(ingressError)
      .mockResolvedValue(makePage(['ok'], 1));
    const { result } = renderHook(() => useAdminDocumentList(fetcher, 'key-1'));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('网络连接异常，请稍后重试。');

    // reload 重试成功恢复 ready（保留当前页游标）
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('enabled = false 时不发起任何请求', () => {
    const fetcher = vi.fn();
    renderHook(() => useAdminDocumentList(fetcher, 'key-1', { enabled: false }));

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enabled 由 false 翻转为 true 时补发首屏请求', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePage(['a'], 1, 1));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAdminDocumentList(fetcher, 'key-1', { enabled }),
      { initialProps: { enabled: false } },
    );

    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledWith(1, 10);
  });

  it('普通（非 GraphQL）错误失败：回落默认兜底文案', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('底层堆栈不应外泄'));
    const { result } = renderHook(() => useAdminDocumentList(fetcher, 'key-1'));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('列表加载失败，请稍后重试。');
  });

  it('failureMessage 覆盖：普通错误采用调用方自定义文案', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useAdminDocumentList(fetcher, 'key-1', { failureMessage: '会话列表加载失败。' }),
    );

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('会话列表加载失败。');
  });

  it('晚到的旧页「失败」响应同样被 requestSeq 竞态防护丢弃（不覆盖新页 ready）', async () => {
    let rejectPage2: (reason: unknown) => void = () => {};
    const fetcher = vi.fn((page: number) => {
      if (page === 2) {
        return new Promise<ReturnType<typeof makePage<string>>>((_resolve, reject) => {
          rejectPage2 = reject;
        });
      }
      return Promise.resolve(makePage(['fresh-page-1'], 1, 20));
    });
    const { result, rerender } = renderHook(
      ({ reloadKey }: { reloadKey: string }) => useAdminDocumentList(fetcher, reloadKey),
      { initialProps: { reloadKey: 'filter-a' } },
    );

    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // 翻到第 2 页（请求挂起），随后筛选变化触发回第 1 页并成功
    await act(async () => {
      result.current.goToPage(2);
    });
    rerender({ reloadKey: 'filter-b' });
    // 等「新页就绪」这一结果态，而非 fetch 调用次数：调用发生 ≠ 响应已落到 reducer，
    // 只等调用次数会在微任务未 flush 时瞬时读到 loading，造成偶发失败。
    await waitFor(() => {
      if (result.current.state.status !== 'ready') {
        throw new Error('等待新页 ready 超时');
      }
      expect(result.current.state.items).toEqual(['fresh-page-1']);
    });
    expect(fetcher).toHaveBeenNthCalledWith(3, 1, 10);

    // 旧的第 2 页请求最后才失败：不得把已就绪的第 1 页打回 failed
    await act(async () => {
      rejectPage2(new Error('stale'));
    });
    expect(result.current.state.status).toBe('ready');
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.items).toEqual(['fresh-page-1']);
  });
});
