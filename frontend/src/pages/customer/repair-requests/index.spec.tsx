// src/pages/customer/repair-requests/index.spec.tsx
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MyRepairRequestListItem,
  RepairRequestListPage,
  RepairRequestListPagination,
} from '@/features/repair-request';

import { GraphQLIngressError } from '@/shared/graphql';

import { CustomerRepairRequestsPage } from './index';

const { deleteMock, fetchListMock, navigateMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  fetchListMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 数据访问层整层替换：页面测试只关心页面行为，adapter 契约由其自身 spec 钉住；
// RESOLUTION_STATUS_LABELS 等纯展示映射保留真实实现。
vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  return {
    ...actual,
    deleteMyRepairRequest: deleteMock,
    fetchMyRepairRequests: fetchListMock,
  };
});

function makeItem(id: number): MyRepairRequestListItem {
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

async function renderReadyList() {
  fetchListMock.mockResolvedValue(makePage());
  render(<CustomerRepairRequestsPage />);

  await screen.findByText('MOCK-RR-2026-0001');
}

describe('客户「我的维修申请」列表页', () => {
  beforeEach(() => {
    // message 是 antd 模块级单例，spyOn 跨用例复用同一 mock，需清空历史避免串扰
    vi.spyOn(message, 'success')
      .mockImplementation(() => undefined as never)
      .mockClear();
    vi.spyOn(message, 'error')
      .mockImplementation(() => undefined as never)
      .mockClear();
    deleteMock.mockReset();
    fetchListMock.mockReset();
    navigateMock.mockReset();
  });

  it('加载后渲染列表数据，含接单状态与处理进度', async () => {
    await renderReadyList();

    expect(screen.getByText('MOCK-RR-2026-0002')).toBeTruthy();
    expect(screen.getByText('已接单')).toBeTruthy();
    expect(screen.getByText('待接单')).toBeTruthy();
    expect(screen.getByText('已解决')).toBeTruthy();
    expect(screen.getByText('暂无回复')).toBeTruthy();
  });

  it('已接单申请不出现删除按钮，未接单申请出现（前端先按契约隐藏）', async () => {
    await renderReadyList();

    const row1 = screen.getByText('MOCK-RR-2026-0001').closest('tr') as HTMLElement;
    const row2 = screen.getByText('MOCK-RR-2026-0002').closest('tr') as HTMLElement;

    // antd 会对两字按钮插入空格，匹配需容忍空白
    expect(row1.textContent).toMatch(/删\s*除/);
    expect(row2.textContent).not.toMatch(/删\s*除/);
  });

  it('点击查看详情跳转到详情路由', async () => {
    await renderReadyList();

    fireEvent.click(screen.getAllByRole('button', { name: '查看详情' })[0]);

    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests/920001');
  });

  it('删除确认后调用删除并成功反馈、刷新列表', async () => {
    deleteMock.mockResolvedValue({ ok: true });
    await renderReadyList();

    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith(920001);
      expect(message.success).toHaveBeenCalledWith('维修申请已删除。');
    });
    await waitFor(() => {
      expect(fetchListMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('删除失败（如已接单竞态）展示明确原因并刷新数据态，不当作成功', async () => {
    deleteMock.mockResolvedValue({
      ok: false,
      reason: 'already-accepted',
      message: '该申请已被工程师接单，不能删除。',
    });
    await renderReadyList();

    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('该申请已被工程师接单，不能删除。');
      expect(message.success).not.toHaveBeenCalled();
    });
  });

  it('列表加载失败展示失败信息与重试入口，重试重新加载', async () => {
    fetchListMock.mockRejectedValue(new Error('network'));
    render(<CustomerRepairRequestsPage />);

    const retry = await screen.findByRole('button', { name: /重\s*试/ });
    expect(screen.getByText('维修申请列表加载失败，请稍后重试。')).toBeTruthy();

    fetchListMock.mockResolvedValue(makePage());
    fireEvent.click(retry);

    await screen.findByText('MOCK-RR-2026-0001');
  });

  it('GraphQLIngressError 透传共享错误模型用户文案，不暴露内部错误', async () => {
    fetchListMock.mockRejectedValue(
      new GraphQLIngressError({ type: 'http', statusCode: 503, message: 'internal boom' }),
    );
    render(<CustomerRepairRequestsPage />);

    expect(await screen.findByText('服务暂时不可用，请稍后重试。')).toBeTruthy();
    expect(screen.queryByText('internal boom')).toBeNull();
  });

  it('删除进行中禁用所有行的删除按钮（防连点），完成后恢复', async () => {
    fetchListMock.mockResolvedValue(makePage({ items: [makeItem(920001), makeItem(920003)] }));
    let releaseDelete: () => void = () => {};
    deleteMock.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          releaseDelete = () => resolve({ ok: true });
        }),
    );
    render(<CustomerRepairRequestsPage />);
    await screen.findByText('MOCK-RR-2026-0001');

    fireEvent.click(screen.getAllByRole('button', { name: /^删\s*除$/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    // 进行中：两行删除按钮均禁用（deletingId 非空），不产生第二次删除请求
    await waitFor(() => expect(deleteMock).toHaveBeenCalledTimes(1));
    const deleteButtons = screen.getAllByRole('button', { name: /^删\s*除$/ });
    expect(deleteButtons).toHaveLength(2);

    for (const button of deleteButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }

    releaseDelete();

    await waitFor(() => expect(message.success).toHaveBeenCalledWith('维修申请已删除。'));
    await waitFor(() => {
      expect(deleteButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    });
  });

  it('无数据时渲染空态文案', async () => {
    fetchListMock.mockResolvedValue(makePage({ items: [], total: 0 }));
    render(<CustomerRepairRequestsPage />);

    expect(
      await screen.findByText('还没有维修申请，点击客户首页「发起维修申请」创建。'),
    ).toBeTruthy();
  });

  it('翻页后以新的分页参数重新拉取', async () => {
    fetchListMock.mockImplementation((target: RepairRequestListPagination) =>
      makePage({ page: target.page, pageSize: 3, total: 4 }),
    );
    render(<CustomerRepairRequestsPage />);
    await screen.findByText('MOCK-RR-2026-0001');

    fireEvent.click(screen.getByText('2'));

    await waitFor(() => {
      expect(fetchListMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 3 });
    });
  });

  it('末页删空后回退上一页并重新拉取', async () => {
    fetchListMock.mockImplementation((target: RepairRequestListPagination) =>
      makePage({
        page: target.page,
        pageSize: 3,
        total: 4,
        items: target.page === 2 ? [makeItem(920005)] : makePage().items,
      }),
    );
    deleteMock.mockResolvedValue({ ok: true });
    render(<CustomerRepairRequestsPage />);
    await screen.findByText('MOCK-RR-2026-0001');

    // 进入第 2 页（仅 1 条），删除后 total=3，末页消失回退到第 1 页
    fireEvent.click(screen.getByText('2'));
    await screen.findByText('MOCK-RR-2026-0005');
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(fetchListMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 3 });
    });
  });
});
