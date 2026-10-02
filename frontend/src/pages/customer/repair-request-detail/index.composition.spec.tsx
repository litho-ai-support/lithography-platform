// src/pages/customer/repair-request-detail/index.composition.spec.tsx
// @vitest-environment jsdom

/**
 * 客户维修申请详情路由级真实组合回归（2026-10-02 复审 P2）。
 *
 * 与 index.spec.tsx 的壳装配测试互补：本 spec 保留真实 CustomerRepairRequestDetailRoute →
 * 真实 CustomerRepairWorkspace → 真实 useCustomerRepairRequestDetailFlow 与真实详情面板，
 * 只 mock 最外层 I/O（会话视图、GraphQL adapter、消息上下文）。
 *
 * 守住的不变量（复审要求）：
 * - 非法 URL ID（非数字 / 0 / 负数 / 小数 / GraphQL Int 上溢 / 缺失）在详情 Query 与
 *   删除 Mutation 之前被路由边界拒绝：不抛异常、不触发无限重渲染、不永久 loading，
 *   不发详情请求、不发删除请求；
 * - 非法目标直显统一 not-found（与后端防探测一致）与「返回历史列表」入口，
 *   不渲染删除入口；左栏列表照常加载；
 * - 有效边界 ID（1 / 2147483647）不被误拒绝，正常发起详情查询并暴露删除入口。
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepairRequestDetail, RepairRequestListPage } from '@/features/repair-request';

import { MessageFeedbackProvider } from '@/shared/ui/message-feedback';

import { CustomerRepairRequestDetailRoute } from './index';

const { authViewMock } = vi.hoisted(() => ({ authViewMock: vi.fn() }));

vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return { ...actual, useAuthSession: () => authViewMock() };
});

const { deleteMock, fetchDetailMock, fetchListMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  fetchDetailMock: vi.fn(),
  fetchListMock: vi.fn(),
}));

// 只替换最外层 GraphQL adapter 的三个读写函数；hooks / 面板 / 状态机全部走真实实现
vi.mock(
  '@/features/repair-request/infrastructure/repair-request-adapter',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/repair-request/infrastructure/repair-request-adapter')
      >();

    return {
      ...actual,
      deleteMyRepairRequest: deleteMock,
      fetchMyRepairRequest: fetchDetailMock,
      fetchMyRepairRequests: fetchListMock,
    };
  },
);

const INVALID_MESSAGE = '维修申请不存在或不可查看。';

const EMPTY_PAGE: RepairRequestListPage = { items: [], page: 1, pageSize: 10, total: 0 };

const ITEM_PAGE: RepairRequestListPage = {
  items: [
    {
      acceptedAt: null,
      createdAt: '2026-01-10T00:30:00.000Z',
      equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
      errorCode: 'E-STAGE-201',
      id: 920001,
      isAccepted: false,
      latestResolutionStatus: null,
      requestNo: 'MOCK-RR-2026-0001',
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
};

function makeDetail(overrides?: Partial<RepairRequestDetail>): RepairRequestDetail {
  return {
    acceptedAt: null,
    contentMd: '## 故障现象\n报错。',
    createdAt: '2026-01-10T00:30:00.000Z',
    equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
    errorCode: 'E-STAGE-201',
    faultDescription: '设备异常',
    id: 920001,
    isAccepted: false,
    latestResolutionStatus: null,
    requestNo: 'MOCK-RR-2026-0001',
    responses: [],
    ...overrides,
  };
}

/** 真实路由表形态：详情路由带 :requestId；列表路由用探针承载「返回历史列表」导航目标 */
function renderDetailRoute(entry: string) {
  return render(
    <MessageFeedbackProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            element={<CustomerRepairRequestDetailRoute />}
            path="/customer/repair-requests/:requestId"
          />
          <Route
            element={<div data-testid="list-route-probe">维修申请列表页</div>}
            path="/customer/repair-requests"
          />
        </Routes>
      </MemoryRouter>
    </MessageFeedbackProvider>,
  );
}

/**
 * 缺失参数走防御分支：真实路由表里详情路径必须携带 :requestId（缺省时命中的是列表
 * 路由），这里用可选参数把同一路由组件挂到探针路径上，覆盖「参数缺失」时同样归为
 * null 的 not-found 口径。
 */
function renderDetailRouteWithoutParam() {
  return render(
    <MessageFeedbackProvider>
      <MemoryRouter initialEntries={['/probe']}>
        <Routes>
          <Route element={<CustomerRepairRequestDetailRoute />} path="/probe/:requestId?" />
          <Route
            element={<div data-testid="list-route-probe">维修申请列表页</div>}
            path="/customer/repair-requests"
          />
        </Routes>
      </MemoryRouter>
    </MessageFeedbackProvider>,
  );
}

/** 非法 ID 的公共不变量：not-found 直显、零详情/删除 I/O、无删除入口、返回只到列表 */
async function expectRejectedDetailPage(): Promise<void> {
  // 不永久 loading：直接呈现 not-found 文案而不是骨架
  await screen.findByText(INVALID_MESSAGE);
  expect(document.querySelector('.ant-skeleton')).toBeNull();

  // 返回入口存在；左栏列表 hook 照常发请求
  expect(screen.getByRole('button', { name: '返回历史列表' })).toBeTruthy();
  await waitFor(() => expect(fetchListMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 }));

  // 详情 Query 与删除 Mutation 均为 0（非法值在路由边界已被拒绝）
  expect(fetchDetailMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();

  // 不渲染删除按钮（防探测：非法目标不得暴露删除入口）
  expect(screen.queryByRole('button', { name: '删除申请' })).toBeNull();
}

beforeEach(() => {
  authViewMock.mockReturnValue({
    session: { accountId: 900101, role: 'CUSTOMER', userInfo: null },
    status: 'authenticated',
  });
  deleteMock.mockReset();
  fetchDetailMock.mockReset();
  fetchListMock.mockReset();
  deleteMock.mockResolvedValue({ ok: true });
  fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
  fetchListMock.mockResolvedValue(EMPTY_PAGE);
});

describe('客户详情路由组合：非法 ID 进入 I/O 前被拒绝', () => {
  it.each([
    ['非数字', 'abc'],
    ['零', '0'],
    ['负数', '-1'],
    ['小数', '1.5'],
    ['GraphQL Int 上溢', '2147483648'],
  ])('非法 ID（%s）：无无限渲染、直显 not-found，点击返回只导航到列表', async (_label, raw) => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    renderDetailRoute(`/customer/repair-requests/${raw}`);

    await expectRejectedDetailPage();

    expect(
      consoleErrorSpy.mock.calls.some((args) =>
        args.some((arg) => String(arg).includes('Too many re-renders')),
      ),
      '不得出现「无限重渲染」告警',
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '返回历史列表' }));
    expect(await screen.findByTestId('list-route-probe')).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });

  it('缺失参数（防御分支）：同一 not-found 口径，零详情/删除 I/O', async () => {
    renderDetailRouteWithoutParam();

    await expectRejectedDetailPage();

    fireEvent.click(screen.getByRole('button', { name: '返回历史列表' }));
    expect(await screen.findByTestId('list-route-probe')).toBeTruthy();
  });

  it('非法 ID 且左栏有数据：列表照常加载、不误选条目，详情区无删除入口', async () => {
    fetchListMock.mockResolvedValue(ITEM_PAGE);

    renderDetailRoute('/customer/repair-requests/abc');

    await screen.findByText(INVALID_MESSAGE);
    // 左栏列表真实渲染条目（列表 hook 未被非法详情目标牵连）
    expect(await screen.findByText('MOCK-RR-2026-0001')).toBeTruthy();
    // 非法目标不参与选中：不误选、不伪造 active
    expect(document.querySelectorAll('.activity-item[aria-current="true"]')).toHaveLength(0);

    const detailPane = document.querySelector('.customer-workspace-detail-pane');
    expect(detailPane).not.toBeNull();
    expect(
      within(detailPane as HTMLElement).queryByRole('button', { name: '删除申请' }),
    ).toBeNull();
    expect(fetchDetailMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe('客户详情路由组合：有效边界 ID 不被误拒绝', () => {
  it.each([
    ['下界 1', '1', 1],
    ['GraphQL Int 上界 2147483647', '2147483647', 2_147_483_647],
  ])('%s：正常发起详情查询并暴露删除入口', async (_label, raw, expectedId) => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail({ id: expectedId }) });

    renderDetailRoute(`/customer/repair-requests/${raw}`);

    await waitFor(() => expect(fetchDetailMock).toHaveBeenCalledWith(expectedId));
    expect(fetchDetailMock).toHaveBeenCalledTimes(1);
    // 真实详情面板渲染申请编号；合法目标才暴露删除入口（与非法目标形成对照）
    expect(await screen.findByText('MOCK-RR-2026-0001')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除申请' })).toBeTruthy();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
