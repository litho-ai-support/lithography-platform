// src/features/repair-request/application/use-engineer-repair-request-detail-flow.spec.ts

/**
 * 工程师详情 + 接单编排单测（详情页唯一业务入口）。
 *
 * 走真实编排 hook、真实详情状态机、真实接单 command 与真实列表失效通道，
 * 只 mock 外部 GraphQL adapter。
 *
 * 重点覆盖接单后的刷新取舍：
 * - 成功 → 用 Mutation 返回值原子注入，不重查（无骨架屏闪现）；
 * - 冲突 / not-accessible → 现状已变，重查收敛，不保留可继续接单的过期状态；
 * - accept-failed（接单结果不确定）→ 只重查详情确认，不自动重发接单 Mutation；
 * - 无权限 → 确定拒绝，申请数据未变，不重查，仅提示。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AcceptRepairRequestResult,
  EngineerRepairRequestDetail,
  EngineerRepairRequestDetailResult,
} from '../infrastructure/engineer-repair-request.types';
import * as engineerRepairRequestAdapter from '../infrastructure/engineer-repair-request-adapter';

import { onEngineerRepairListsInvalidated } from './engineer-repair-list-refresh';
import { useEngineerRepairRequestDetailFlow } from './use-engineer-repair-request-detail-flow';

vi.mock('../infrastructure/engineer-repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof engineerRepairRequestAdapter>();

  return {
    ...actual,
    acceptRepairRequest: vi.fn(),
    fetchEngineerRepairRequestDetail: vi.fn(),
  };
});

const acceptMock = vi.mocked(engineerRepairRequestAdapter.acceptRepairRequest);
const fetchDetailMock = vi.mocked(engineerRepairRequestAdapter.fetchEngineerRepairRequestDetail);
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

const CONFLICT_RESULT: AcceptRepairRequestResult = {
  ok: false,
  reason: 'already-accepted',
  message: '该维修申请已被接单，请刷新后查看最新状态',
};

/** 订阅真实失效通道，验证编排不重复宣告（宣告职责在接单 command 内部） */
function trackListInvalidation() {
  const calls: number[] = [];
  const unsubscribe = onEngineerRepairListsInvalidated(() => {
    calls.push(calls.length + 1);
  });

  return { calls, unsubscribe };
}

async function renderReadyFlow(requestId: number | null = 21) {
  const flow = renderHook(() => useEngineerRepairRequestDetailFlow(requestId));
  await waitFor(() => expect(flow.result.current.state.status).toBe('ready'));

  return flow;
}

beforeEach(() => {
  acceptMock.mockReset();
  fetchDetailMock.mockReset();
  fetchDetailMock.mockResolvedValue({ ok: true, detail: buildDetail(21, false) });
});

describe('useEngineerRepairRequestDetailFlow', () => {
  it('挂载即加载详情，未接单时暴露可接单状态', async () => {
    const { result, unmount } = await renderReadyFlow();

    expect(fetchDetailMock).toHaveBeenCalledTimes(1);
    expect(fetchDetailMock).toHaveBeenCalledWith(21);
    expect(result.current.lastAcceptResult).toBeNull();
    expect(result.current.accepting).toBe(false);
    expect(result.current.state).toMatchObject({ detail: buildDetail(21, false) });
    unmount();
  });

  it('接单成功后应用 Mutation 返回的详情，不重新查询', async () => {
    const acceptedDetail = buildDetail(21, true);
    acceptMock.mockResolvedValue({ ok: true, detail: acceptedDetail });
    const { result, unmount } = await renderReadyFlow();

    let acceptResult: AcceptRepairRequestResult | null = null;
    await act(async () => {
      acceptResult = await result.current.accept();
    });

    expect(acceptResult).toEqual({ ok: true, detail: acceptedDetail });
    expect(result.current.state).toMatchObject({ status: 'ready', detail: acceptedDetail });
    // 写后读来自同一 Mutation 返回值：不产生第二次详情查询
    expect(fetchDetailMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastAcceptResult).toEqual({ ok: true, detail: acceptedDetail });
    unmount();
  });

  it('接单成功后宣告列表失效一次（编排不重复宣告）', async () => {
    acceptMock.mockResolvedValue({ ok: true, detail: buildDetail(21, true) });
    const invalidation = trackListInvalidation();
    const { result, unmount } = await renderReadyFlow();

    await act(async () => {
      await result.current.accept();
    });

    expect(invalidation.calls).toHaveLength(1);
    invalidation.unsubscribe();
    unmount();
  });

  it('接单冲突后重查详情并宣告列表失效一次', async () => {
    acceptMock.mockResolvedValue(CONFLICT_RESULT);
    fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });
    fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });
    const invalidation = trackListInvalidation();
    const { result, unmount } = await renderReadyFlow();

    let acceptResult: AcceptRepairRequestResult | null = null;
    await act(async () => {
      acceptResult = await result.current.accept();
    });

    expect(acceptResult).toEqual(CONFLICT_RESULT);
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(2));
    expect(fetchDetailMock).toHaveBeenLastCalledWith(21);
    // 重查后展示最新接单状态，接单按钮随 isAccepted 消失
    expect(result.current.state).toMatchObject({ status: 'ready', detail: buildDetail(21, true) });
    expect(invalidation.calls).toHaveLength(1);
    invalidation.unsubscribe();
    unmount();
  });

  it('冲突重查进入 not-accessible 时保留冲突提示，且不保留可接单的旧详情', async () => {
    acceptMock.mockResolvedValue(CONFLICT_RESULT);
    fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });
    // 申请被他人接走后当前工程师不再可读：后端统一拒绝且不泄露存在性
    fetchDetailMock.mockResolvedValueOnce({
      ok: false,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });
    const { result, unmount } = await renderReadyFlow();

    await act(async () => {
      await result.current.accept();
    });

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toEqual({
      status: 'failed',
      requestSeq: 2,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });
    // 冲突反馈跨重查保留，供 UI 优先于通用不可访问文案展示
    expect(result.current.lastAcceptResult).toEqual(CONFLICT_RESULT);
    unmount();
  });

  it('接单返回 not-accessible（申请已被删除）后同样重查收敛', async () => {
    acceptMock.mockResolvedValue({
      ok: false,
      reason: 'not-accessible',
      message: '维修申请不存在或已删除。',
    });
    fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });
    fetchDetailMock.mockResolvedValueOnce({
      ok: false,
      reason: 'not-accessible',
      message: NOT_ACCESSIBLE_MESSAGE,
    });
    const { result, unmount } = await renderReadyFlow();

    await act(async () => {
      await result.current.accept();
    });

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(2));
    expect(result.current.state).toMatchObject({ status: 'failed', reason: 'not-accessible' });
    unmount();
  });

  it.each([['insufficient-permission', '当前账号无权接单维修申请。']] as const)(
    '接单确定拒绝 reason=%s 不改变申请数据，不错误重查详情',
    async (reason, message) => {
      acceptMock.mockResolvedValue({ ok: false, reason, message });
      const { result, unmount } = await renderReadyFlow();

      let acceptResult: AcceptRepairRequestResult | null = null;
      await act(async () => {
        acceptResult = await result.current.accept();
      });

      expect(acceptResult).toEqual({ ok: false, reason, message });
      expect(fetchDetailMock).toHaveBeenCalledTimes(1);
      // 原详情保持 ready，UI 展示内联错误提示
      expect(result.current.state).toMatchObject({
        status: 'ready',
        detail: buildDetail(21, false),
      });
      unmount();
    },
  );

  describe('accept-failed 接单结果不确定（只重查确认，不自动重发 Mutation）', () => {
    const ACCEPT_FAILED_RESULT: AcceptRepairRequestResult = {
      ok: false,
      reason: 'accept-failed',
      message: '接单失败，请稍后重试。',
    };

    it('触发一次详情重查，重查发现已接单时最终展示已接单状态', async () => {
      acceptMock.mockResolvedValue(ACCEPT_FAILED_RESULT);
      fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });
      fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });
      const invalidation = trackListInvalidation();
      const { result, unmount } = await renderReadyFlow();

      await act(async () => {
        await result.current.accept();
      });

      await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(2));
      expect(fetchDetailMock).toHaveBeenLastCalledWith(21);
      // 重查收敛为已接单状态，接单按钮随 isAccepted 消失
      expect(result.current.state).toMatchObject({
        status: 'ready',
        detail: buildDetail(21, true),
      });
      // 重查确认已接单：失败反馈收敛为成功，不再保留矛盾的“接单失败”提示
      expect(result.current.lastAcceptResult).toEqual({ ok: true, detail: buildDetail(21, true) });
      // 结果不确定只重查确认，不自动重发接单 Mutation
      expect(acceptMock).toHaveBeenCalledTimes(1);
      // 列表失效仅由接单 command 宣告一次，编排不重复宣告
      expect(invalidation.calls).toHaveLength(1);
      invalidation.unsubscribe();
      unmount();
    });

    it('重查发现仍未接单时保留失败反馈，且可手动重试接单', async () => {
      acceptMock.mockResolvedValue(ACCEPT_FAILED_RESULT);
      fetchDetailMock.mockResolvedValue({ ok: true, detail: buildDetail(21, false) });
      const { result, unmount } = await renderReadyFlow();

      await act(async () => {
        await result.current.accept();
      });

      await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(2));
      // 重查后仍未接单：详情保持 ready，失败反馈保留供 UI 展示
      expect(result.current.state).toMatchObject({
        status: 'ready',
        detail: buildDetail(21, false),
      });
      expect(result.current.lastAcceptResult).toEqual(ACCEPT_FAILED_RESULT);

      // 不自动重发：至此接单 Mutation 只发送过一次
      expect(acceptMock).toHaveBeenCalledTimes(1);

      // 用户手动重试：ref 锁已释放，可再次发起接单
      acceptMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, true) });
      await act(async () => {
        await result.current.accept();
      });
      expect(acceptMock).toHaveBeenCalledTimes(2);
      expect(result.current.state).toMatchObject({ detail: buildDetail(21, true) });
      unmount();
    });

    it('重查失败时进入既有加载失败/重试状态，失败反馈保留', async () => {
      acceptMock.mockResolvedValue(ACCEPT_FAILED_RESULT);
      fetchDetailMock.mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });
      fetchDetailMock.mockResolvedValueOnce({
        ok: false,
        reason: 'load-failed',
        message: '维修申请详情加载失败，请稍后重试。',
      });
      const { result, unmount } = await renderReadyFlow();

      await act(async () => {
        await result.current.accept();
      });

      await waitFor(() => expect(result.current.state.status).toBe('failed'));
      expect(result.current.state).toMatchObject({
        status: 'failed',
        reason: 'load-failed',
      });
      expect(result.current.lastAcceptResult).toEqual(ACCEPT_FAILED_RESULT);
      // 失败路径同样不产生第二次接单 Mutation
      expect(acceptMock).toHaveBeenCalledTimes(1);
      unmount();
    });
  });

  it('进行中重复调用 accept 返回 null，不产生并行 Mutation 与重复刷新', async () => {
    let resolveAccept: (value: AcceptRepairRequestResult) => void = () => {};
    acceptMock.mockReturnValueOnce(
      new Promise<AcceptRepairRequestResult>((resolve) => {
        resolveAccept = resolve;
      }),
    );
    const { result, unmount } = await renderReadyFlow();

    let first: Promise<AcceptRepairRequestResult | null> = Promise.resolve(null);
    let second: Promise<AcceptRepairRequestResult | null> = Promise.resolve(null);
    await act(async () => {
      first = result.current.accept();
      second = result.current.accept();
    });

    expect(acceptMock).toHaveBeenCalledTimes(1);
    expect(result.current.accepting).toBe(true);

    await act(async () => {
      resolveAccept({ ok: true, detail: buildDetail(21, true) });
      await first;
      await second;
    });

    await expect(second).resolves.toBeNull();
    expect(result.current.accepting).toBe(false);
    expect(fetchDetailMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('requestId 为 null 时 accept 直接拒绝，不发送 Mutation 也不重查', async () => {
    fetchDetailMock.mockReset();
    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetailFlow(null));

    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(fetchDetailMock).not.toHaveBeenCalled();

    let acceptResult: AcceptRepairRequestResult | null = null;
    await act(async () => {
      acceptResult = await result.current.accept();
    });

    expect(acceptResult).toBeNull();
    expect(acceptMock).not.toHaveBeenCalled();

    await act(async () => {
      result.current.reload();
    });
    expect(fetchDetailMock).not.toHaveBeenCalled();
    unmount();
  });

  it('详情首次加载失败后可通过 reload 重试', async () => {
    const networkFailure: EngineerRepairRequestDetailResult = {
      ok: false,
      reason: 'load-failed',
      message: '维修申请详情加载失败，请稍后重试。',
    };
    fetchDetailMock.mockReset();
    fetchDetailMock
      .mockResolvedValueOnce(networkFailure)
      .mockResolvedValueOnce({ ok: true, detail: buildDetail(21, false) });

    const { result, unmount } = renderHook(() => useEngineerRepairRequestDetailFlow(21));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchDetailMock).toHaveBeenCalledTimes(2);
    expect(fetchDetailMock).toHaveBeenLastCalledWith(21);
    unmount();
  });
});
