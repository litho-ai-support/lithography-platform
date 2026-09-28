// src/features/repair-request/application/use-customer-repair-request-detail-flow.spec.ts

/**
 * 客户维修申请详情流程单测（application 状态机 + 删除命令编排）。
 *
 * 走真实 hook，只 mock 外部 GraphQL adapter；页面不再需要 mock adapter。
 * 覆盖：加载 / not-found / transport 失败归一、切换 requestId 立即回到 loading、
 * 乱序返回守卫、卸载作废、删除成功与失败（业务拒绝 / transport）后的提示与回刷、
 * 删除目标代次守卫（切换目标 / 卸载 / 跨目标锁）与重复删除防连点。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotifyFeedback } from '@/shared/feedback';
import { GraphQLIngressError } from '@/shared/graphql';

import * as repairRequestAdapter from '../infrastructure/repair-request-adapter';
import type {
  DeleteMyRepairRequestResult,
  MyRepairRequestDetailResult,
  RepairRequestDetail,
} from '../infrastructure/repair-request-read.types';

import { useCustomerRepairRequestDetailFlow } from './use-customer-repair-request-detail-flow';

vi.mock('../infrastructure/repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof repairRequestAdapter>();

  return {
    ...actual,
    deleteMyRepairRequest: vi.fn(),
    fetchMyRepairRequest: vi.fn(),
  };
});

const fetchDetailMock = vi.mocked(repairRequestAdapter.fetchMyRepairRequest);
const deleteMock = vi.mocked(repairRequestAdapter.deleteMyRepairRequest);

/** 注入的反馈端口替身：application 不再直接调用 AntD message */
const notify = vi.fn<NotifyFeedback>();

function makeDetail(overrides?: Partial<RepairRequestDetail>): RepairRequestDetail {
  return {
    id: 920001,
    requestNo: 'MOCK-RR-2026-0001',
    errorCode: 'E-STAGE-201',
    faultDescription: '设备异常',
    contentMd: '## 故障现象\n报错。',
    createdAt: '2026-01-10T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
    responses: [],
    ...overrides,
  };
}

/** 可外部结算的 pending promise：精确控制「请求仍在途」时的时序 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

type FlowProps = { requestId: number };

beforeEach(() => {
  // 反馈经注入端口上报（application 不依赖 AntD message），断言直接看端口调用
  notify.mockClear();
  fetchDetailMock.mockReset();
  deleteMock.mockReset();
});

describe('useCustomerRepairRequestDetailFlow 的加载状态机', () => {
  it('初次加载进入 ready', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchDetailMock).toHaveBeenCalledWith(920001);
    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: { requestNo: 'MOCK-RR-2026-0001' },
    });
  });

  it('not-found 归并为 notFound 失败态（区别于 transport 失败）', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: false,
      reason: 'not-found',
      message: '维修申请不存在或不可查看。',
    });

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        notFound: true,
        message: '维修申请不存在或不可查看。',
      }),
    );
  });

  it('transport 失败透传共享错误文案，notFound=false', async () => {
    fetchDetailMock.mockRejectedValue(
      new GraphQLIngressError({ type: 'network', message: 'offline' }),
    );

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        notFound: false,
        message: '网络连接异常，请稍后重试。',
      }),
    );
  });

  it('切换 requestId 立即回到 loading，不残留上一份详情（目标切换）', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });

    const { result, rerender } = renderHook(
      ({ requestId }: FlowProps) => useCustomerRepairRequestDetailFlow(requestId, notify),
      { initialProps: { requestId: 920001 } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // 新详情未返回：必须立即进入 loading，不展示上一份申请
    fetchDetailMock.mockReturnValue(new Promise(() => {}));
    rerender({ requestId: 920003 });

    expect(result.current.state.status).toBe('loading');
  });

  it('乱序返回：先发的旧请求晚到不得覆盖当前详情', async () => {
    const firstRequest = deferred<MyRepairRequestDetailResult>();
    fetchDetailMock.mockReturnValueOnce(firstRequest.promise);

    const { result, rerender } = renderHook(
      ({ requestId }: FlowProps) => useCustomerRepairRequestDetailFlow(requestId, notify),
      { initialProps: { requestId: 920001 } },
    );

    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({ id: 920003, requestNo: 'MOCK-RR-2026-0003' }),
    });
    rerender({ requestId: 920003 });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    expect(fetchDetailMock).toHaveBeenCalledTimes(2);

    // A 的成功响应晚到：代次已作废，不得覆盖 B
    await act(async () => {
      firstRequest.resolve({ ok: true, detail: makeDetail() });
      await firstRequest.promise;
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: { requestNo: 'MOCK-RR-2026-0003' },
    });
  });

  it('乱序返回：旧请求晚到的 not-found 不覆盖当前详情', async () => {
    const firstRequest = deferred<MyRepairRequestDetailResult>();
    fetchDetailMock.mockReturnValueOnce(firstRequest.promise);

    const { result, rerender } = renderHook(
      ({ requestId }: FlowProps) => useCustomerRepairRequestDetailFlow(requestId, notify),
      { initialProps: { requestId: 920001 } },
    );

    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({ id: 920003, requestNo: 'MOCK-RR-2026-0003' }),
    });
    rerender({ requestId: 920003 });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));

    await act(async () => {
      firstRequest.resolve({
        ok: false,
        reason: 'not-found',
        message: '维修申请不存在或不可查看。',
      });
      await firstRequest.promise;
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: { requestNo: 'MOCK-RR-2026-0003' },
    });
  });

  // React 19 对「卸载后 setState」不再告警，该分支无法从外部观察到状态提交，
  // 故本用例只做冒烟校验（迟到响应走代次早退分支，不抛错）。
  it('卸载后迟到的响应不再提交状态', async () => {
    const pending = deferred<MyRepairRequestDetailResult>();
    fetchDetailMock.mockReturnValue(pending.promise);

    const { unmount } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));
    unmount();

    await act(async () => {
      pending.resolve({ ok: true, detail: makeDetail() });
      await pending.promise;
    });
  });
});

describe('useCustomerRepairRequestDetailFlow 的删除命令', () => {
  it('删除成功后提示并返回 true（页面据此导航回列表）', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome = false;
    await act(async () => {
      outcome = await result.current.deleteRequest();
    });

    expect(outcome).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith(920001);
    expect(notify).toHaveBeenCalledWith({ type: 'success', text: '维修申请已删除。' });
  });

  it('删除业务失败展示明确原因并刷新详情，返回 false', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockResolvedValue({
      ok: false,
      reason: 'already-accepted',
      message: '该申请已被工程师接单，不能删除。',
    });

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome = true;
    await act(async () => {
      outcome = await result.current.deleteRequest();
    });

    expect(outcome).toBe(false);
    expect(notify).toHaveBeenCalledWith({
      type: 'error',
      text: '该申请已被工程师接单，不能删除。',
    });
    // 失败后刷新详情：首次加载 + 删除失败后重拉
    expect(fetchDetailMock.mock.calls.length).toBe(2);
  });

  it('删除 transport 失败透传共享文案并刷新详情，返回 false', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockRejectedValue(new GraphQLIngressError({ type: 'network', message: 'offline' }));

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let outcome = true;
    await act(async () => {
      outcome = await result.current.deleteRequest();
    });

    expect(outcome).toBe(false);
    expect(notify).toHaveBeenCalledWith({ type: 'error', text: '网络连接异常，请稍后重试。' });
    expect(fetchDetailMock.mock.calls.length).toBe(2);
  });

  it('删除进行中重复发起被拒（同目标同代次），只发出一次删除请求', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    const pending = deferred<DeleteMyRepairRequestResult>();
    deleteMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useCustomerRepairRequestDetailFlow(920001, notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.deleteRequest();
    });
    expect(result.current.deleting).toBe(true);

    // 在途期间第二次发起：直接被拒（返回 false），不产生第二次删除请求
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      second = result.current.deleteRequest();
    });
    await expect(second).resolves.toBe(false);
    expect(deleteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ok: true });
      await first;
    });
    await waitFor(() => expect(result.current.deleting).toBe(false));
  });
});

/**
 * 删除命令的目标 / 生命周期代次守卫。
 *
 * 删除在途时目标切换或组件卸载，旧结果只能静默收尾：不提示、不回刷、不返回成功。
 * 其中「不得回刷」最关键——回刷会推进加载代次，使已在途的新目标详情请求过期，
 * 而新目标的 effect 不会再运行，页面会永久停在骨架态。
 */
describe('useCustomerRepairRequestDetailFlow 的删除代次守卫', () => {
  const DETAIL_A = makeDetail();
  const DETAIL_B = makeDetail({ id: 920003, requestNo: 'MOCK-RR-2026-0003' });

  /** 渲染 A 并让删除保持 pending，返回删除请求的结算句柄与渲染句柄 */
  async function renderAWithPendingDelete() {
    const deleteA = deferred<DeleteMyRepairRequestResult>();

    fetchDetailMock.mockResolvedValue({ ok: true, detail: DETAIL_A });
    deleteMock.mockReturnValue(deleteA.promise);

    const view = renderHook(
      ({ requestId }: FlowProps) => useCustomerRepairRequestDetailFlow(requestId, notify),
      { initialProps: { requestId: DETAIL_A.id } },
    );

    await waitFor(() => expect(view.result.current.state.status).toBe('ready'));
    act(() => {
      void view.result.current.deleteRequest();
    });
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(DETAIL_A.id));

    return { ...view, deleteA };
  }

  it('删除 pending 期间切到 B：A 的成功晚到不提示、不返回成功，B 保持可用', async () => {
    const { deleteA, result, rerender } = await renderAWithPendingDelete();
    const fetchCountBeforeSwitch = fetchDetailMock.mock.calls.length;

    fetchDetailMock.mockResolvedValue({ ok: true, detail: DETAIL_B });
    rerender({ requestId: DETAIL_B.id });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));
    expect(result.current.state).toMatchObject({ detail: { requestNo: 'MOCK-RR-2026-0003' } });

    await act(async () => {
      deleteA.resolve({ ok: true });
    });

    expect(notify).not.toHaveBeenCalled();
    // B 未受影响：仍显示 B，且删除入口可用（旧目标的 pending 按钮态未串到新目标）
    expect(result.current.deleting).toBe(false);
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 1);
  });

  it('删除 pending 期间切到 B（B 在途）：A 的失败不回刷、不提示，B 未被作废', async () => {
    const { deleteA, result, rerender } = await renderAWithPendingDelete();
    const fetchCountBeforeSwitch = fetchDetailMock.mock.calls.length;
    const loadB = deferred<MyRepairRequestDetailResult>();

    fetchDetailMock.mockReturnValueOnce(loadB.promise);
    rerender({ requestId: DETAIL_B.id });
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 1));

    await act(async () => {
      deleteA.resolve({
        ok: false,
        reason: 'already-accepted',
        message: '该申请已被工程师接单，不能删除。',
      });
    });

    // 旧目标的失败整体丢弃：不提示、不发起回刷
    expect(notify).not.toHaveBeenCalled();
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 1);

    // B 到达后正常渲染：证明其请求没有被旧目标的回刷作废
    await act(async () => {
      loadB.resolve({ ok: true, detail: DETAIL_B });
    });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: { requestNo: 'MOCK-RR-2026-0003' },
    });
  });

  it('删除 pending 期间切到 B（B 在途）：A 的 throw 不回刷、不提示', async () => {
    const { deleteA, result, rerender } = await renderAWithPendingDelete();
    const fetchCountBeforeSwitch = fetchDetailMock.mock.calls.length;
    const loadB = deferred<MyRepairRequestDetailResult>();

    fetchDetailMock.mockReturnValueOnce(loadB.promise);
    rerender({ requestId: DETAIL_B.id });
    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 1));

    await act(async () => {
      deleteA.reject(new GraphQLIngressError({ type: 'network', message: 'offline' }));
    });

    expect(notify).not.toHaveBeenCalled();
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeSwitch + 1);

    await act(async () => {
      loadB.resolve({ ok: true, detail: DETAIL_B });
    });
    expect(result.current.state).toMatchObject({
      status: 'ready',
      detail: { requestNo: 'MOCK-RR-2026-0003' },
    });
  });

  it('删除 pending 期间卸载：旧删除成功不提示、不再发请求', async () => {
    const { deleteA, unmount } = await renderAWithPendingDelete();
    const fetchCountBeforeUnmount = fetchDetailMock.mock.calls.length;

    unmount();
    await act(async () => {
      deleteA.resolve({ ok: true });
    });

    expect(notify).not.toHaveBeenCalled();
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeUnmount);
  });

  it('删除 pending 期间卸载：旧删除业务失败不提示、不再发请求', async () => {
    const { deleteA, unmount } = await renderAWithPendingDelete();
    const fetchCountBeforeUnmount = fetchDetailMock.mock.calls.length;

    unmount();
    await act(async () => {
      deleteA.resolve({
        ok: false,
        reason: 'already-accepted',
        message: '该申请已被工程师接单，不能删除。',
      });
    });

    expect(notify).not.toHaveBeenCalled();
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeUnmount);
  });

  it('删除 pending 期间卸载：旧删除 throw 不提示、不再发请求', async () => {
    const { deleteA, unmount } = await renderAWithPendingDelete();
    const fetchCountBeforeUnmount = fetchDetailMock.mock.calls.length;

    unmount();
    await act(async () => {
      deleteA.reject(new GraphQLIngressError({ type: 'network', message: 'offline' }));
    });

    expect(notify).not.toHaveBeenCalled();
    expect(fetchDetailMock).toHaveBeenCalledTimes(fetchCountBeforeUnmount);
  });

  it('B 可正常删除：旧 A 的收尾既不阻塞也不误释放 B 的锁', async () => {
    const { deleteA, result, rerender } = await renderAWithPendingDelete();

    fetchDetailMock.mockResolvedValue({ ok: true, detail: DETAIL_B });
    rerender({ requestId: DETAIL_B.id });
    await waitFor(() => expect(result.current.state).toMatchObject({ status: 'ready' }));

    // 旧 A 的删除仍在途：B 的删除入口必须可用（按钮态已随目标切换复位）
    expect(result.current.deleting).toBe(false);

    const deleteB = deferred<DeleteMyRepairRequestResult>();
    deleteMock.mockReturnValueOnce(deleteB.promise);

    let pB: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pB = result.current.deleteRequest();
    });
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(2));
    expect(deleteMock).toHaveBeenLastCalledWith(DETAIL_B.id);

    // A 的旧失败晚到：不得解锁 B 在途的删除
    await act(async () => {
      deleteA.resolve({
        ok: false,
        reason: 'already-accepted',
        message: '该申请已被工程师接单，不能删除。',
      });
    });
    expect(notify).not.toHaveBeenCalled();
    // 锁仍归 B：B 的删除按钮保持 pending 态，未出现第三次删除请求
    expect(result.current.deleting).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(2);

    // B 成功 → 返回 true（页面据此导航），提示成功
    await act(async () => {
      deleteB.resolve({ ok: true });
      await pB;
    });
    await expect(pB).resolves.toBe(true);
    expect(notify).toHaveBeenCalledWith({ type: 'success', text: '维修申请已删除。' });
    await waitFor(() => expect(result.current.deleting).toBe(false));
  });
});
