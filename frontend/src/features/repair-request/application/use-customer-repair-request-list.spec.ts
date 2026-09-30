// src/features/repair-request/application/use-customer-repair-request-list.spec.ts

/**
 * 客户维修申请列表流程单测（application 状态机）。
 *
 * 走真实 hook，只 mock 外部 GraphQL adapter；页面不再需要 mock adapter。
 * 覆盖：加载 / 失败归一 / 重试 / 翻页、乱序返回守卫、
 * 删除成功与失败（业务拒绝 / transport）后的提示与回刷、重复删除防连点、末页删空回退。
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotifyFeedback } from '@/shared/feedback';
import { GraphQLIngressError } from '@/shared/graphql';

import * as repairRequestAdapter from '../infrastructure/repair-request-adapter';
import type {
  DeleteMyRepairRequestResult,
  RepairRequestListItem,
  RepairRequestListPage,
} from '../infrastructure/repair-request-read.types';

import { useCustomerRepairRequestList } from './use-customer-repair-request-list';

vi.mock('../infrastructure/repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof repairRequestAdapter>();

  return {
    ...actual,
    deleteMyRepairRequest: vi.fn(),
    fetchMyRepairRequests: vi.fn(),
  };
});

const fetchListMock = vi.mocked(repairRequestAdapter.fetchMyRepairRequests);
const deleteMock = vi.mocked(repairRequestAdapter.deleteMyRepairRequest);

/** 注入的反馈端口替身：application 不再直接调用 AntD message */
const notify = vi.fn<NotifyFeedback>();

function makeItem(id: number): RepairRequestListItem {
  return {
    id,
    requestNo: `MOCK-RR-2026-${String(id).slice(-4)}`,
    errorCode: 'E-STAGE-201',
    createdAt: '2026-01-10T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
  };
}

function makePage(overrides?: Partial<RepairRequestListPage>): RepairRequestListPage {
  return {
    items: [makeItem(920001), makeItem(920002)],
    total: 2,
    page: 1,
    pageSize: 10,
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

beforeEach(() => {
  // 反馈经注入端口上报（application 不依赖 AntD message），断言直接看端口调用
  notify.mockClear();
  fetchListMock.mockReset();
  deleteMock.mockReset();
});

describe('useCustomerRepairRequestList 的加载状态机', () => {
  it('初次加载以第一页游标发起并进入 ready', async () => {
    fetchListMock.mockResolvedValue(makePage());

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchListMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 1, total: 2 } });
  });

  it('GraphQLIngressError 透传共享错误模型用户文案（错误归一）', async () => {
    fetchListMock.mockRejectedValue(
      new GraphQLIngressError({ type: 'http', statusCode: 503, message: 'internal boom' }),
    );

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        message: '服务暂时不可用，请稍后重试。',
      }),
    );
  });

  it('非 GraphQL 失败归一到列表兜底文案', async () => {
    fetchListMock.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));

    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: 'failed',
        message: '维修申请列表加载失败，请稍后重试。',
      }),
    );
  });

  it('重试以当前游标重新拉取并恢复 ready', async () => {
    fetchListMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(makePage());

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchListMock).toHaveBeenCalledTimes(2);
    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 });
  });

  it('翻页以新分页参数拉取', async () => {
    fetchListMock.mockImplementation((target) =>
      Promise.resolve(makePage({ page: target.page, total: 11 })),
    );

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.goToPage(2, 10);
    });

    await waitFor(() => expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }));
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
  });

  it('乱序返回：旧请求晚到不得覆盖当前结果', async () => {
    const firstRequest = deferred<RepairRequestListPage>();
    fetchListMock.mockReturnValueOnce(firstRequest.promise);

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    expect(result.current.state.status).toBe('loading');

    // 翻页发出第二个请求并先返回
    fetchListMock.mockResolvedValueOnce(makePage({ page: 2, total: 11 }));
    await act(async () => {
      result.current.goToPage(2, 10);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 2 } }));

    // 第一页请求晚到：序号已过期，不得覆盖
    await act(async () => {
      firstRequest.resolve(makePage({ page: 1, total: 11 }));
      await firstRequest.promise;
    });

    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
  });
});

describe('useCustomerRepairRequestList 的删除命令', () => {
  it('删除成功后提示并刷新列表', async () => {
    fetchListMock.mockResolvedValue(makePage());
    deleteMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      await expect(result.current.deleteRequest(920001)).resolves.toBe(true);
    });

    expect(deleteMock).toHaveBeenCalledWith(920001);
    expect(notify).toHaveBeenCalledWith({ type: 'success', text: '维修申请已删除。' });
    expect(fetchListMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('删除业务失败展示明确原因并刷新数据态，不当作成功', async () => {
    fetchListMock.mockResolvedValue(makePage());
    deleteMock.mockResolvedValue({
      ok: false,
      reason: 'already-accepted',
      message: '该申请已被工程师接单，不能删除。',
    });

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      await result.current.deleteRequest(920001);
    });

    expect(notify).toHaveBeenCalledWith({
      type: 'error',
      text: '该申请已被工程师接单，不能删除。',
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(fetchListMock.mock.calls.length).toBe(2);
  });

  it('删除 transport 失败透传共享错误文案并刷新数据态', async () => {
    fetchListMock.mockResolvedValue(makePage());
    deleteMock.mockRejectedValue(new GraphQLIngressError({ type: 'network', message: 'offline' }));

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      await result.current.deleteRequest(920001);
    });

    expect(notify).toHaveBeenCalledWith({ type: 'error', text: '网络连接异常，请稍后重试。' });
    expect(fetchListMock.mock.calls.length).toBe(2);
  });

  it('删除进行中重复发起被拒（防连点），只发出一次删除请求', async () => {
    fetchListMock.mockResolvedValue(makePage());
    const pending = deferred<DeleteMyRepairRequestResult>();
    deleteMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    let first: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      first = result.current.deleteRequest(920001);
    });
    expect(result.current.deletingId).toBe(920001);

    // 在途期间第二次发起：直接被拒（返回 false），不产生第二次删除请求
    await act(async () => {
      await expect(result.current.deleteRequest(920002)).resolves.toBe(false);
    });
    expect(deleteMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ok: true });
      await first;
    });
    await waitFor(() => expect(result.current.deletingId).toBeNull());
  });

  it('末页删空后回退上一页并重新拉取', async () => {
    fetchListMock.mockImplementation((target) =>
      Promise.resolve(
        makePage({
          page: target.page,
          total: 11,
          items: target.page === 2 ? [makeItem(920005)] : makePage().items,
        }),
      ),
    );
    deleteMock.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.goToPage(2, 10);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 2 } }));

    // 第 2 页仅 1 条：删除后 total=10，末页消失回退到第 1 页
    await act(async () => {
      await result.current.deleteRequest(920005);
    });

    await waitFor(() => expect(fetchListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }));
  });
});

describe('useCustomerRepairRequestList 的删除 × 分页交错（四次复查 P2 修复）', () => {
  /**
   * 删除在途期间页面只禁用删除按钮、不禁用分页，用户仍可翻页。
   * 三种删除结果（成功 / 业务拒绝 / transport 异常）与翻页交错时，
   * 回刷都必须服从用户**最新**选择的页，不得用捕获的旧游标把用户拉回旧页。
   */
  function setupPagedInterleave() {
    fetchListMock.mockImplementation((target) =>
      Promise.resolve(makePage({ page: target.page, total: 21 })),
    );
    const pendingDelete = deferred<DeleteMyRepairRequestResult>();
    deleteMock.mockReturnValue(pendingDelete.promise);

    return { pendingDelete };
  }

  it('删除成功在途时用户翻页：回刷第 2 页，不把用户拉回第 1 页', async () => {
    const { pendingDelete } = setupPagedInterleave();

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 1 } }));

    let deleting: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      deleting = result.current.deleteRequest(920001);
    });

    // 删除仍在途：用户翻到第 2 页并完成加载
    await act(async () => {
      result.current.goToPage(2, 10);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 2 } }));

    await act(async () => {
      pendingDelete.resolve({ ok: true });
      await deleting;
    });

    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
  });

  it('删除业务拒绝在途时用户翻页：同样回刷最新页', async () => {
    const { pendingDelete } = setupPagedInterleave();

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 1 } }));

    let deleting: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      deleting = result.current.deleteRequest(920001);
    });
    await act(async () => {
      result.current.goToPage(2, 10);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 2 } }));

    await act(async () => {
      pendingDelete.resolve({
        ok: false,
        reason: 'already-accepted',
        message: '该申请已被工程师接单，不能删除。',
      });
      await deleting;
    });

    expect(notify).toHaveBeenCalledWith({
      type: 'error',
      text: '该申请已被工程师接单，不能删除。',
    });
    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
  });

  it('删除 transport 异常在途时用户翻页：同样回刷最新页', async () => {
    const { pendingDelete } = setupPagedInterleave();

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 1 } }));

    let deleting: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      deleting = result.current.deleteRequest(920001);
    });
    await act(async () => {
      result.current.goToPage(2, 10);
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 2 } }));

    await act(async () => {
      pendingDelete.reject(new GraphQLIngressError({ type: 'network', message: 'offline' }));
      await deleting;
    });

    expect(notify).toHaveBeenCalledWith({ type: 'error', text: '网络连接异常，请稍后重试。' });
    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
  });

  it('分页响应晚于删除响应到达：丢弃过期分页结果后仍停留在最新选择页', async () => {
    // 第 2 页请求被拆成「用户翻页发出的」与「删除回刷发出的」两个独立 deferred，
    // 以便让先发的那个晚到，验证它不会覆盖回刷结果
    const pageTwoRequests: Array<ReturnType<typeof deferred<RepairRequestListPage>>> = [];
    fetchListMock.mockImplementation((target) => {
      if (target.page !== 2) {
        return Promise.resolve(makePage({ page: target.page, total: 21 }));
      }

      const request = deferred<RepairRequestListPage>();
      pageTwoRequests.push(request);

      return request.promise;
    });
    const pendingDelete = deferred<DeleteMyRepairRequestResult>();
    deleteMock.mockReturnValue(pendingDelete.promise);

    const { result } = renderHook(() => useCustomerRepairRequestList(notify));
    await waitFor(() => expect(result.current.state).toMatchObject({ data: { page: 1 } }));

    let deleting: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      deleting = result.current.deleteRequest(920001);
    });

    // 用户翻页：第 2 页首个请求仍在途
    await act(async () => {
      result.current.goToPage(2, 10);
    });
    expect(result.current.state.status).toBe('loading');

    // 删除先返回：回刷目标仍是第 2 页（用户最新选择），不是被拉回第 1 页
    await act(async () => {
      pendingDelete.resolve({ ok: true });
    });
    await waitFor(() => expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 }));
    expect(pageTwoRequests).toHaveLength(2);

    // 早先发出的第 2 页请求晚到：请求序号已过期，不得覆盖当前结果
    await act(async () => {
      pageTwoRequests[0].resolve(makePage({ page: 2, total: 21, items: [makeItem(920001)] }));
      await pageTwoRequests[0].promise;
    });

    // 回刷发出的第 2 页请求最后到达，成为最终结果
    await act(async () => {
      pageTwoRequests[1].resolve(
        makePage({ page: 2, total: 21, items: [makeItem(920002), makeItem(920003)] }),
      );
      await deleting;
    });

    expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 });
    expect(result.current.state).toMatchObject({ status: 'ready', data: { page: 2 } });
    // 区分性断言：最终展示的是回刷请求的数据，过期请求的结果被丢弃
    expect((result.current.state as { data: RepairRequestListPage }).data.items).toHaveLength(2);
  });
});
