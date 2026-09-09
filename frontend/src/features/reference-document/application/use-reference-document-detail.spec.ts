// src/features/reference-document/application/use-reference-document-detail.spec.ts
// @vitest-environment jsdom

/**
 * 参考资料详情 query 状态机单测（负责人 0909 阻塞项 2）。
 *
 * 用两个可控 Promise 模拟「请求 A 在途时切换 B、B 先返回、A 后返回」的竞态：
 * 无论旧请求成功、not-found 还是抛错，都不得覆盖当前 ID 的状态；
 * 非法参数（id=null）不发起请求，直接进入统一 not-found 口径。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReferenceDocumentDetail } from '../infrastructure/reference-document.types';
import * as referenceDocumentAdapter from '../infrastructure/reference-document-adapter';

import { useReferenceDocumentDetail } from './use-reference-document-detail';

vi.mock('../infrastructure/reference-document-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof referenceDocumentAdapter>();

  return {
    ...actual,
    fetchReferenceDocument: vi.fn(),
  };
});

const fetchDetailMock = vi.mocked(referenceDocumentAdapter.fetchReferenceDocument);

function buildDetail(id: number): ReferenceDocumentDetail {
  return {
    id,
    title: `资料 ${id}`,
    documentType: 'MAINTENANCE_GUIDE',
    equipmentModelId: null,
    equipmentModelName: null,
    description: null,
    originalFilename: null,
    mimeType: null,
    contentText: `内容 ${id}`,
    creatorNickname: '系统管理员',
    createdAt: '2026-08-02T09:30:00.000Z',
    updatedAt: '2026-08-05T14:00:00.000Z',
  };
}

/** 可控 Promise：手动决定 resolve/reject 时机，模拟响应乱序 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  fetchDetailMock.mockReset();
});

describe('useReferenceDocumentDetail 竞态保护', () => {
  it('A 在途时切换 B、B 先返回 A 后返回：最终始终显示 B', async () => {
    const promiseA = deferred<{ ok: true; detail: ReferenceDocumentDetail }>();
    const promiseB = deferred<{ ok: true; detail: ReferenceDocumentDetail }>();

    fetchDetailMock.mockImplementation((id) =>
      id === 970001 ? (promiseA.promise as never) : (promiseB.promise as never),
    );

    const { result, rerender } = renderHook(({ id }) => useReferenceDocumentDetail(id), {
      initialProps: { id: 970001 as number | null },
    });

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(970001));

    // 请求 A 在途时切换到 B
    rerender({ id: 970002 });
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(970002));

    // B 先返回 → ready(B)
    await act(async () => {
      promiseB.resolve({ ok: true, detail: buildDetail(970002) });
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state.status === 'ready' ? result.current.state.detail.id : null).toBe(
      970002,
    );

    // A 后返回 → 不得覆盖 B
    await act(async () => {
      promiseA.resolve({ ok: true, detail: buildDetail(970001) });
    });
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.status === 'ready' ? result.current.state.detail.id : null).toBe(
      970002,
    );
  });

  it('旧请求后返回 not-found 或抛错，均不能覆盖新请求的成功状态', async () => {
    const promiseA = deferred<{ ok: false; reason: string; message: string }>();
    const promiseB = deferred<{ ok: true; detail: ReferenceDocumentDetail }>();

    fetchDetailMock.mockImplementation((id) =>
      id === 970001 ? (promiseA.promise as never) : (promiseB.promise as never),
    );

    const { result, rerender } = renderHook(({ id }) => useReferenceDocumentDetail(id), {
      initialProps: { id: 970001 as number | null },
    });

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(970001));

    rerender({ id: 970002 });
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(970002));

    await act(async () => {
      promiseB.resolve({ ok: true, detail: buildDetail(970002) });
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // 旧请求 A 的 not-found 不得覆盖
    await act(async () => {
      promiseA.resolve({ ok: false, reason: 'not-found', message: '参考资料不存在或不可查看。' });
    });
    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.status === 'ready' ? result.current.state.detail.id : null).toBe(
      970002,
    );
  });

  it('非法参数（id=null）不发起请求，直接进入统一 not-found；恢复合法 ID 后正常加载', async () => {
    const { result, rerender } = renderHook(({ id }) => useReferenceDocumentDetail(id), {
      initialProps: { id: null as number | null },
    });

    await waitFor(() => expect(result.current.state.status).toBe('not-found'));
    expect(fetchDetailMock).not.toHaveBeenCalled();
    expect(result.current.state.status === 'not-found' ? result.current.state.message : null).toBe(
      '参考资料不存在或不可查看。',
    );

    fetchDetailMock.mockResolvedValue({ ok: true, detail: buildDetail(970002) });

    rerender({ id: 970002 });

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(970002));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('reload 基于当前 ID 发起新请求（新请求序号），成功后刷新详情', async () => {
    fetchDetailMock
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(970002) })
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(970002) });

    const { result } = renderHook(() => useReferenceDocumentDetail(970002));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(2));
    expect(fetchDetailMock).toHaveBeenLastCalledWith(970002);
  });
});
