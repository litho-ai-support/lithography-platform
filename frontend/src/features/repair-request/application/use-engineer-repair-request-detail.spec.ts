// src/features/repair-request/application/use-engineer-repair-request-detail.spec.ts

/**
 * 工程师详情 query 状态机单测。
 *
 * 走真实 hook，只 mock 外部 GraphQL adapter；
 * 重点覆盖请求序号竞态守卫与 applyDetail（接单 Mutation 返回值原子注入）的生效边界。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type {
  EngineerRepairRequestDetail,
  EngineerRepairRequestDetailResult,
} from '../infrastructure/engineer-repair-request.types';
import * as engineerRepairRequestAdapter from '../infrastructure/engineer-repair-request-adapter';

import {
  type EngineerRepairRequestDetailLoadOutcome,
  useEngineerRepairRequestDetail,
} from './use-engineer-repair-request-detail';

vi.mock('../infrastructure/engineer-repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof engineerRepairRequestAdapter>();

  return {
    ...actual,
    fetchEngineerRepairRequestDetail: vi.fn(),
  };
});

const fetchMock = vi.mocked(engineerRepairRequestAdapter.fetchEngineerRepairRequestDetail);
// 统一不可访问文案的唯一真源（adapter 导出），测试不复制第二份
const NOT_ACCESSIBLE_MESSAGE = engineerRepairRequestAdapter.ENGINEER_DETAIL_NOT_ACCESSIBLE_MESSAGE;

function buildDetail(id: number, isAccepted: boolean): EngineerRepairRequestDetail {
  return {
    id,
    requestNo: `RR20260902100000ABC${id}`,
    equipmentModel: { id: 3, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
    errorCode: 'E-100',
    faultDescription: '设备无法启动',
    contentMd: '# 设备维修申请',
    createdAt: '2026-09-02T08:00:00.000Z',
    isAccepted,
    acceptedAt: isAccepted ? '2026-09-02T08:30:00.000Z' : null,
    latestResolutionStatus: null,
    responses: [],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useEngineerRepairRequestDetail', () => {
  it('有效 ID 初次加载进入 ready 并返回映射后的详情', async () => {
    fetchMock.mockResolvedValue({ ok: true, detail: buildDetail(21, false) });

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(21);
    expect(result.current.state).toEqual({
      status: 'ready',
      requestSeq: 1,
      detail: buildDetail(21, false),
    });
  });

  it('ID 为 null 时不发请求，静态落入统一不可访问反馈，reload 为 no-op', async () => {
    const { result } = renderHook(() => useEngineerRepairRequestDetail(null));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(fetchMock).not.toHaveBeenCalled();
    // 文案与 adapter 兜底共用单一真源，不在本层复制第二份
    expect(result.current.state).toEqual({
      status: 'failed',
      requestSeq: 1,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });

    await act(async () => {
      result.current.reload();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('有效 ID 请求在飞时切到无效 ID：作废在飞结果并落入统一不可访问反馈', async () => {
    let resolveDetail: (value: EngineerRepairRequestDetailResult) => void = () => {};
    const pending = new Promise<EngineerRepairRequestDetailResult>((resolve) => {
      resolveDetail = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    const { result, rerender } = renderHook(
      ({ requestId }: { requestId: number | null }) => useEngineerRepairRequestDetail(requestId),
      // 显式放宽初始 props 类型：后续 rerender 需要切到 null（无效 ID 竞态守卫场景）
      { initialProps: { requestId: 21 as number | null } },
    );
    expect(result.current.state.status).toBe('loading');

    rerender({ requestId: null });
    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });

    // 序号已推进：此前在飞的详情返回不得复活为 ready
    await act(async () => {
      resolveDetail({ ok: true, detail: buildDetail(21, false) });
      await pending;
    });

    expect(result.current.state).toMatchObject({ status: 'failed', reason: 'not-accessible' });
  });

  it.each([
    ['not-accessible', NOT_ACCESSIBLE_MESSAGE],
    ['load-failed', '维修申请详情加载失败，请稍后重试。'],
  ] as const)('业务拒绝 reason=%s 原样落入失败状态', async (reason, message) => {
    fetchMock.mockResolvedValue({ ok: false, reason, message });

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toEqual({
      status: 'failed',
      requestSeq: 1,
      reason,
      message,
    });
  });

  it('transport / auth 失败落入 reason=null 并使用共享错误模型文案', async () => {
    const authError = new GraphQLIngressError({ type: 'auth', message: 'token invalid' });
    fetchMock.mockRejectedValue(authError);

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({ reason: null, message: authError.userMessage });
    expect(authError.userMessage).toBe('登录状态已失效，请重新登录后再试。');
  });

  it('ID 变化时旧请求晚返回不覆盖新详情', async () => {
    let resolveFirst: (value: EngineerRepairRequestDetailResult) => void = () => {};
    const firstRequest = new Promise<EngineerRepairRequestDetailResult>((resolve) => {
      resolveFirst = resolve;
    });
    fetchMock.mockReturnValueOnce(firstRequest);
    fetchMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(22, false) });

    const { result, rerender } = renderHook(
      ({ requestId }: { requestId: number | null }) => useEngineerRepairRequestDetail(requestId),
      { initialProps: { requestId: 21 } },
    );

    rerender({ requestId: 22 });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: buildDetail(22, false),
    });

    await act(async () => {
      resolveFirst({ ok: true, detail: buildDetail(21, false) });
      await firstRequest;
    });

    expect(result.current.state).toMatchObject({ detail: buildDetail(22, false) });
  });

  it('reload 按同一 ID 重新查询并推进序号', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) })
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(21);
    expect(result.current.state).toEqual({
      status: 'ready',
      requestSeq: 2,
      detail: buildDetail(21, true),
    });
  });

  it('ready 态下 applyDetail 原子注入 Mutation 返回的详情，不发起新查询', async () => {
    fetchMock.mockResolvedValue({ ok: true, detail: buildDetail(21, false) });

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.applyDetail(buildDetail(21, true));
    });

    expect(result.current.state).toEqual({
      status: 'ready',
      // 序号随当前在飞请求保持，不制造新的在飞请求语义
      requestSeq: 1,
      detail: buildDetail(21, true),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loading 态下 applyDetail 被丢弃，不抢占查询结果', async () => {
    let resolveDetail: (value: EngineerRepairRequestDetailResult) => void = () => {};
    const pending = new Promise<EngineerRepairRequestDetailResult>((resolve) => {
      resolveDetail = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));
    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      result.current.applyDetail(buildDetail(21, true));
    });
    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      resolveDetail({ ok: true, detail: buildDetail(21, false) });
      await pending;
    });

    expect(result.current.state).toMatchObject({ detail: buildDetail(21, false) });
  });

  it('failed 态下 applyDetail 被丢弃，不复活为可接单的 ready 状态', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });

    const { result } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    await act(async () => {
      result.current.applyDetail(buildDetail(21, false));
    });

    expect(result.current.state).toMatchObject({ status: 'failed', reason: 'not-accessible' });
  });
});

describe('useEngineerRepairRequestDetail 的 apply-response（回复原子注入）', () => {
  const BASE = buildDetail(21, true);
  const EXISTING = {
    id: 51,
    engineerNickname: '陈工',
    resolutionStatus: 'PENDING',
    responseText: '已初步处理',
    createdAt: '2026-09-02T09:00:00.000Z',
  } as const;

  async function renderReadyWithExistingResponse() {
    fetchMock.mockResolvedValue({
      ok: true,
      detail: { ...BASE, responses: [EXISTING], latestResolutionStatus: 'PENDING' },
    });
    const rendered = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(rendered.result.current.state.status).toBe('ready'));

    return rendered;
  }

  it('追加新回复并在同一事件内同步 latestResolutionStatus，不发起新查询', async () => {
    const { result, unmount } = await renderReadyWithExistingResponse();

    await act(async () => {
      result.current.applyResponse({
        id: 61,
        engineerNickname: '陈工',
        resolutionStatus: 'RESOLVED',
        responseText: '已修复',
        createdAt: '2026-09-02T10:00:00.000Z',
      });
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      requestSeq: 1,
      detail: {
        responses: [
          EXISTING,
          {
            id: 61,
            engineerNickname: '陈工',
            resolutionStatus: 'RESOLVED',
            responseText: '已修复',
            createdAt: '2026-09-02T10:00:00.000Z',
          },
        ],
        latestResolutionStatus: 'RESOLVED',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('同一回复 ID 不重复追加（重放/重复返回被去重）', async () => {
    const { result, unmount } = await renderReadyWithExistingResponse();

    await act(async () => {
      result.current.applyResponse({ ...EXISTING });
    });

    expect(result.current.state).toMatchObject({
      detail: { responses: [EXISTING], latestResolutionStatus: 'PENDING' },
    });
    unmount();
  });

  it('按 createdAt ASC + id ASC 排序（与后端读取契约同口径）', async () => {
    const { result, unmount } = await renderReadyWithExistingResponse();

    // 服务端 ID 更大但 createdAt 更早（并发窗口内其他工程师刚追加过回复）
    await act(async () => {
      result.current.applyResponse({
        id: 61,
        engineerNickname: '李工',
        resolutionStatus: 'PENDING',
        responseText: '并发回复',
        createdAt: '2026-09-02T08:30:00.000Z',
      });
    });

    const responses =
      result.current.state.status === 'ready' ? result.current.state.detail.responses : [];
    expect(responses.map((item) => [item.id, item.createdAt])).toEqual([
      [61, '2026-09-02T08:30:00.000Z'],
      [51, '2026-09-02T09:00:00.000Z'],
    ]);
    unmount();
  });
});

describe('useEngineerRepairRequestDetail 的 recheckSilently（静默重查）', () => {
  it('成功时不进入 loading，保留 ready 详情并原子更新为最新详情', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) })
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recheckSilently();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 不切 loading：状态始终 ready，序号不随静默重查推进（无在飞请求语义）
    expect(result.current.state).toEqual({
      status: 'ready',
      requestSeq: 1,
      detail: buildDetail(21, true),
    });
    expect(outcome).toEqual({ ok: true, detail: buildDetail(21, true) });
    unmount();
  });

  it('业务拒绝失败时不改动查询状态机，保留当前详情与既有状态', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) })
      .mockResolvedValueOnce({
        ok: false,
        reason: 'not-accessible',
        message: NOT_ACCESSIBLE_MESSAGE,
      });

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recheckSilently();
    });

    expect(outcome).toEqual({
      ok: false,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });
    // 详情与 ready 状态保留，失败结果仅交编排层决策
    expect(result.current.state).toEqual({
      status: 'ready',
      requestSeq: 1,
      detail: buildDetail(21, true),
    });
    unmount();
  });

  it('transport 失败转 reason=null 的显式结果，保留当前详情', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    fetchMock
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) })
      .mockRejectedValueOnce(networkError);

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recheckSilently();
    });

    expect(outcome).toEqual({ ok: false, reason: null, message: networkError.userMessage });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: buildDetail(21, true),
    });
    unmount();
  });

  it('在飞期间再次调用只发出一个请求，重入返回 null', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });
    let resolveRecheck: (value: EngineerRepairRequestDetailResult) => void = () => {};
    const pending = new Promise<EngineerRepairRequestDetailResult>((resolve) => {
      resolveRecheck = resolve;
    });
    fetchMock.mockReturnValueOnce(pending);

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let first: Promise<EngineerRepairRequestDetailLoadOutcome | null> = Promise.resolve(null);
    let second: Promise<EngineerRepairRequestDetailLoadOutcome | null> = Promise.resolve(null);
    await act(async () => {
      first = result.current.recheckSilently();
      second = result.current.recheckSilently();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(second).resolves.toBeNull();

    await act(async () => {
      resolveRecheck({ ok: true, detail: buildDetail(21, false) });
      await first;
    });

    await expect(first).resolves.toEqual({ ok: true, detail: buildDetail(21, false) });
    unmount();
  });

  it('静默重查开始后序号被其他查询推进时，旧结果不得覆盖新状态', async () => {
    // 初始加载 + 静默重查在飞；随后 reload 推进序号（1 → 2）
    fetchMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });
    let resolveRecheck: (value: EngineerRepairRequestDetailResult) => void = () => {};
    const recheckPending = new Promise<EngineerRepairRequestDetailResult>((resolve) => {
      resolveRecheck = resolve;
    });
    fetchMock.mockReturnValueOnce(recheckPending);
    fetchMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(22, false) });

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(21));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let recheck: Promise<EngineerRepairRequestDetailLoadOutcome | null> = Promise.resolve(null);
    await act(async () => {
      recheck = result.current.recheckSilently();
    });

    // 静默重查在飞期间，用户点「重试」触发 reload：序号推进、状态切 loading
    let reloadOutcome: unknown;
    await act(async () => {
      reloadOutcome = await result.current.reload();
    });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      requestSeq: 2,
      detail: buildDetail(22, false),
    });
    expect(reloadOutcome).toEqual({ ok: true, detail: buildDetail(22, false) });

    // 旧静默重查此时才返回：若实现错误地在完成后读取最新序号，
    // 旧详情会被误贴上序号 2 而覆盖新状态；正确实现按开始时快照序号被守卫丢弃
    await act(async () => {
      resolveRecheck({ ok: true, detail: buildDetail(21, true) });
      await recheck;
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      requestSeq: 2,
      detail: buildDetail(22, false),
    });
    unmount();
  });

  it('requestId 为 null 时静默重查不发请求，直接返回 null', async () => {
    fetchMock.mockReset();
    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetail(null));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.recheckSilently();
    });

    expect(outcome).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
  });
});
