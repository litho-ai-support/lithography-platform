// src/pages/customer/repair-requests/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户「我的维修申请」列表页单测（页面层：只断言渲染与导航 / 命令装配意图）。
 *
 * 列表 query、删除命令、分页回退、竞态守卫与错误归一的时序行为均由
 * feature application hook（useCustomerRepairRequestList）承担，已在
 * src/features/repair-request/application/use-customer-repair-request-list.spec.ts 覆盖；
 * 本 spec 只验证页面把 hook 的干净 view state / 命令装配为正确 DOM 与导航目标。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerRepairRequestListView,
  RepairRequestListItem,
  RepairRequestListPage,
} from '@/features/repair-request';

import { MessageFeedbackProvider } from '@/shared/ui/message-feedback';

import { CustomerRepairRequestsPage } from './index';

const { listHook, navigateMock } = vi.hoisted(() => ({
  listHook: {
    current: {
      state: { status: 'loading' } as unknown,
      deletingId: null as null | number,
      deleteRequest: vi.fn(),
      goToPage: vi.fn(),
      retry: vi.fn(),
    },
  },
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 只替换流程 hook：页面不再感知 adapter，RESOLUTION_STATUS_LABELS 等纯展示映射保留真实实现。
vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  return { ...actual, useCustomerRepairRequestList: () => listHook.current };
});

const deleteRequestMock = listHook.current.deleteRequest;
const goToPageMock = listHook.current.goToPage;
const retryMock = listHook.current.retry;

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
    items: [
      {
        id: 920001,
        requestNo: 'MOCK-RR-2026-0001',
        errorCode: 'E-STAGE-201',
        createdAt: '2026-01-10T00:30:00.000Z',
        isAccepted: false,
        acceptedAt: null,
        latestResolutionStatus: null,
        equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
      },
      {
        id: 920002,
        requestNo: 'MOCK-RR-2026-0002',
        errorCode: 'E-LENS-102',
        createdAt: '2026-01-11T00:30:00.000Z',
        isAccepted: true,
        acceptedAt: '2026-01-11T00:50:00.000Z',
        latestResolutionStatus: 'RESOLVED',
        equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
      },
    ],
    total: 2,
    page: 1,
    pageSize: 10,
    ...overrides,
  };
}

/**
 * 以给定 view state 渲染列表页（deletingId 可选）。
 *
 * 页面经 `useMessageFeedback()` 消费反馈端口，Provider 是必要装配条件，
 * 故测试走真实 Provider wrapper，而不是让缺失 Provider 的装配回归假绿。
 */
function renderWithState(
  state: CustomerRepairRequestListView,
  options: { deletingId?: null | number } = {},
) {
  listHook.current.state = state;
  listHook.current.deletingId = options.deletingId ?? null;

  return render(
    <MessageFeedbackProvider>
      <CustomerRepairRequestsPage />
    </MessageFeedbackProvider>,
  );
}

describe('客户「我的维修申请」列表页', () => {
  beforeEach(() => {
    listHook.current.state = { status: 'loading' };
    listHook.current.deletingId = null;
    deleteRequestMock.mockReset();
    goToPageMock.mockReset();
    retryMock.mockReset();
    navigateMock.mockReset();
  });

  it('就绪态渲染列表数据，含接单状态与处理进度', () => {
    renderWithState({ status: 'ready', data: makePage() });

    expect(screen.getByText('MOCK-RR-2026-0002')).toBeTruthy();
    expect(screen.getByText('已接单')).toBeTruthy();
    expect(screen.getByText('待接单')).toBeTruthy();
    expect(screen.getByText('已解决')).toBeTruthy();
    expect(screen.getByText('暂无回复')).toBeTruthy();
  });

  it('已接单申请不出现删除按钮，未接单申请出现（前端先按契约隐藏）', () => {
    renderWithState({ status: 'ready', data: makePage() });

    const row1 = screen.getByText('MOCK-RR-2026-0001').closest('tr') as HTMLElement;
    const row2 = screen.getByText('MOCK-RR-2026-0002').closest('tr') as HTMLElement;

    // antd 会对两字按钮插入空格，匹配需容忍空白
    expect(row1.textContent).toMatch(/删\s*除/);
    expect(row2.textContent).not.toMatch(/删\s*除/);
  });

  it('点击查看详情跳转到详情路由', () => {
    renderWithState({ status: 'ready', data: makePage() });

    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);

    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests/920001');
  });

  it('删除确认后以记录 id 调用删除命令（页面只装配命令，不感知 adapter）', async () => {
    renderWithState({ status: 'ready', data: makePage() });

    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    expect(deleteRequestMock).toHaveBeenCalledWith(920001);
  });

  it('删除进行中（deletingId 非空）禁用所有行的删除按钮', () => {
    renderWithState(
      {
        status: 'ready',
        data: makePage({ items: [makeItem(920001), makeItem(920003)], total: 2 }),
      },
      { deletingId: 920001 },
    );

    const deleteButtons = screen.getAllByRole('button', { name: /^删\s*除$/ });
    expect(deleteButtons).toHaveLength(2);

    for (const button of deleteButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('失败态展示失败信息与重试入口，点击重试调用 retry', () => {
    renderWithState({ status: 'failed', message: '维修申请列表加载失败，请稍后重试。' });

    expect(screen.getByText('维修申请列表加载失败，请稍后重试。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  // S2-3：失败态与空表互斥，不得叠加「还没有维修申请」空态（否则失败被误读为空库）
  it('失败态只呈现失败信息，不叠加空表与空态文案', () => {
    const { container } = renderWithState({
      status: 'failed',
      message: '维修申请列表加载失败，请稍后重试。',
    });

    expect(screen.queryByText('还没有维修申请，点击客户首页「发起维修申请」创建。')).toBeNull();
    expect(container.querySelector('.ant-table')).toBeNull();
  });

  // S2-3：未就绪前呈现加载态，不提前渲染空态文案
  it('加载中呈现加载态且不出现空态文案', () => {
    const { container } = renderWithState({ status: 'loading' });

    expect(container.querySelector('.ant-spin-spinning')).not.toBeNull();
    expect(screen.queryByText('还没有维修申请，点击客户首页「发起维修申请」创建。')).toBeNull();
  });

  // S2-5：长连续文本列安全换行，不撑破表格
  it('申请编号 / 型号 / 错误码列携带换行类，长文本不撑破表格', () => {
    renderWithState({ status: 'ready', data: makePage() });

    for (const cell of [
      screen.getByText('MOCK-RR-2026-0001'),
      screen.getByText('E-STAGE-201'),
      screen.getAllByText('型号一')[0],
    ]) {
      expect(cell.classList.contains('break-words')).toBe(true);
    }
  });

  it('就绪且库为空时渲染空态文案', () => {
    renderWithState({ status: 'ready', data: makePage({ items: [], total: 0 }) });

    expect(screen.getByText('还没有维修申请，点击客户首页「发起维修申请」创建。')).toBeTruthy();
  });

  it('翻页时以新的分页参数调用 goToPage', () => {
    renderWithState({ status: 'ready', data: makePage({ total: 11 }) });

    fireEvent.click(screen.getByText('2'));

    expect(goToPageMock).toHaveBeenCalledWith(2, 10);
  });
});
