// src/features/admin-document-database/ui/admin-repair-requests-tab.spec.tsx
// @vitest-environment jsdom

/**
 * 维修申请 Tab 页面级测试（R3 + R4）。
 *
 * R3：筛选控件在 FilterBar 内、loading/失败/空/数据各状态与表格分页同处
 * TableContainer 内、Drawer 在容器外；筛选/分页/Drawer 可操作。
 * R4：默认空态使用「暂无…」而非筛选空文案、清空/纯空格恢复默认态、
 * isAccepted=false 是有效筛选且进入请求变量、旧请求晚到不覆盖新结果。
 *
 * 只 mock 本 feature 的 adapter 模块，其余走真实组件与状态机。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminListPage,
  AdminRepairRequestListItem,
  AdminRepairRequestSummary,
} from '../infrastructure/admin-document-database.types';
import {
  fetchAdminEquipmentModelOptions,
  fetchAdminRepairRequests,
  fetchAdminRepairRequestSummary,
} from '../infrastructure/admin-document-database-adapter';

import { AdminRepairRequestsTab } from './admin-repair-requests-tab';

vi.mock('../infrastructure/admin-document-database-adapter', async (importOriginal) => {
  type Adapter = typeof import('../infrastructure/admin-document-database-adapter');
  const actual = await importOriginal<Adapter>();

  return {
    ...actual,
    fetchAdminEquipmentModelOptions: vi.fn(),
    fetchAdminRepairRequestSummary: vi.fn(),
    fetchAdminRepairRequests: vi.fn(),
  };
});

const fetchRepairMock = vi.mocked(fetchAdminRepairRequests);
const fetchSummaryMock = vi.mocked(fetchAdminRepairRequestSummary);
const fetchModelOptionsMock = vi.mocked(fetchAdminEquipmentModelOptions);

function buildRepairItem(id: number): AdminRepairRequestListItem {
  return {
    id,
    requestNo: `RR-2026090${id}-001`,
    customerNickname: `客户${id}`,
    companyName: null,
    equipmentModelId: 49,
    equipmentModelCode: 'ASML-TWINSCAN-NXT-1980DI',
    equipmentModelName: 'ASML TWINSCAN NXT:1980Di',
    errorCode: 'E-001',
    isAccepted: false,
    acceptedAt: null,
    acceptedByEngineerNickname: null,
    latestResolutionStatus: null,
    createdAt: '2026-09-01T08:00:00.000Z',
  };
}

function buildSummary(id: number): AdminRepairRequestSummary {
  return {
    ...buildRepairItem(id),
    faultDescription: '曝光光路异常',
    contentMd: '## 故障描述\n\n曝光光路异常。',
  };
}

function buildPage<T>(items: T[], total = items.length, page = 1): AdminListPage<T> {
  return { items, total, page, pageSize: 10 };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchRepairMock.mockReset();
  fetchSummaryMock.mockReset();
  fetchModelOptionsMock.mockReset();

  fetchRepairMock.mockResolvedValue(buildPage([buildRepairItem(1), buildRepairItem(2)]));
  fetchSummaryMock.mockResolvedValue({ ok: true, detail: buildSummary(1) });
  fetchModelOptionsMock.mockResolvedValue([
    { id: 49, modelCode: 'ASML-TWINSCAN-NXT-1980DI', modelName: 'ASML TWINSCAN NXT:1980Di' },
  ]);
});

describe('AdminRepairRequestsTab（R3 视觉容器）', () => {
  it('筛选控件包在 FilterBar 内，loading 骨架在 TableContainer 内', async () => {
    const { container } = render(<AdminRepairRequestsTab />);

    const filterBar = container.querySelector('.filter-bar');
    expect(filterBar).not.toBeNull();
    expect(filterBar?.querySelector('input')).not.toBeNull();

    const tableContainer = container.querySelector('.table-container');
    expect(tableContainer).not.toBeNull();
    expect(tableContainer?.querySelector('.ant-skeleton')).not.toBeNull();

    // flush 初始取数的落定，避免测试结束后才 dispatch 的 act 警告
    await act(async () => {});
  });

  it('有数据：表格与分页在 TableContainer 内，摘要 Drawer 在容器外且可打开', async () => {
    const { container } = render(<AdminRepairRequestsTab />);

    expect(await screen.findByText('RR-20260901-001')).toBeInTheDocument();
    const tableContainer = container.querySelector('.table-container');
    expect(tableContainer?.querySelector('table')).not.toBeNull();
    expect(tableContainer?.querySelector('.ant-pagination')).not.toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /摘\s*要/ })[0]);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText(/维修申请摘要/)).toBeInTheDocument();
    expect(container.querySelector('.table-container .ant-drawer')).toBeNull();
  });

  it('加载失败：错误告警在 TableContainer 内呈现，重试可恢复数据', async () => {
    fetchRepairMock.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(<AdminRepairRequestsTab />);

    expect(await screen.findByText('维修申请列表加载失败，请稍后重试。')).toBeInTheDocument();
    expect(container.querySelector('.table-container .ant-alert-error')).not.toBeNull();

    // AntD 两字按钮在中间插入全角空格（「重 试」），用正则容忍
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(await screen.findByText('RR-20260901-001')).toBeInTheDocument();
  });
});

describe('AdminRepairRequestsTab（R4 有效筛选单一真源）', () => {
  it('默认空（无筛选）：显示「暂无维修申请。」而非筛选空文案，请求参数为空对象', async () => {
    fetchRepairMock.mockResolvedValue(buildPage([]));
    render(<AdminRepairRequestsTab />);

    expect(await screen.findByText('暂无维修申请。')).toBeInTheDocument();
    expect(screen.queryByText('没有符合筛选条件的维修申请。')).toBeNull();
    expect(fetchRepairMock).toHaveBeenCalledWith(1, 10, {});
  });

  it('真实筛选无结果：显示筛选空文案，请求变量保留筛选字段', async () => {
    fetchRepairMock.mockResolvedValue(buildPage([]));
    render(<AdminRepairRequestsTab />);
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('按申请编号搜索'), {
      target: { value: 'RR-999' },
    });

    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchRepairMock).toHaveBeenLastCalledWith(1, 10, { requestNo: 'RR-999' });
    expect(await screen.findByText('没有符合筛选条件的维修申请。')).toBeInTheDocument();
  });

  it('清空输入（含纯空格）后恢复默认空态与空请求参数', async () => {
    fetchRepairMock.mockResolvedValue(buildPage([]));
    render(<AdminRepairRequestsTab />);
    const search = screen.getByPlaceholderText('按申请编号搜索');
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(1));

    fireEvent.change(search, { target: { value: 'RR-999' } });
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(await screen.findByText('没有符合筛选条件的维修申请。')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '   ' } });
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(3), { timeout: 2000 });
    expect(fetchRepairMock).toHaveBeenLastCalledWith(1, 10, {});
    expect(await screen.findByText('暂无维修申请。')).toBeInTheDocument();
  });

  it('仅接单状态=待接单（false）是有效筛选，请求变量保留 isAccepted:false', async () => {
    fetchRepairMock.mockResolvedValue(buildPage([]));
    render(<AdminRepairRequestsTab />);
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(1));

    // 筛选区第一个下拉为「接单状态」
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('待接单'));

    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchRepairMock).toHaveBeenLastCalledWith(1, 10, { isAccepted: false });
    expect(await screen.findByText('没有符合筛选条件的维修申请。')).toBeInTheDocument();
  });

  it('分页可操作：翻页请求同时保留筛选参数并回带 page=2', async () => {
    fetchRepairMock.mockResolvedValueOnce(buildPage([buildRepairItem(1)], 25, 1));
    fetchRepairMock.mockResolvedValueOnce(buildPage([buildRepairItem(1)], 25, 1));
    fetchRepairMock.mockResolvedValueOnce(buildPage([buildRepairItem(5)], 25, 2));
    const { container } = render(<AdminRepairRequestsTab />);
    await screen.findByText('RR-20260901-001');

    fireEvent.change(screen.getByPlaceholderText('按申请编号搜索'), { target: { value: 'RR-' } });
    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchRepairMock).toHaveBeenLastCalledWith(1, 10, { requestNo: 'RR-' });

    const secondPage = container.querySelector('.ant-pagination-item-2 a');
    expect(secondPage).not.toBeNull();
    fireEvent.click(secondPage as HTMLElement);

    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(3));
    expect(fetchRepairMock).toHaveBeenLastCalledWith(2, 10, { requestNo: 'RR-' });
    expect(await screen.findByText('RR-20260905-001')).toBeInTheDocument();
  });

  it('快速筛选时旧请求晚到不覆盖新列表（requestSeq 竞态防护）', async () => {
    let resolveStale: (value: AdminListPage<AdminRepairRequestListItem>) => void = () => {};
    const stalePage = new Promise<AdminListPage<AdminRepairRequestListItem>>((resolve) => {
      resolveStale = resolve;
    });
    fetchRepairMock.mockReturnValueOnce(stalePage);
    fetchRepairMock.mockResolvedValueOnce(buildPage([buildRepairItem(2)]));

    render(<AdminRepairRequestsTab />);
    fireEvent.change(screen.getByPlaceholderText('按申请编号搜索'), { target: { value: 'RR-2' } });

    await waitFor(() => expect(fetchRepairMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(await screen.findByText('RR-20260902-001')).toBeInTheDocument();

    // 首笔旧请求此刻才返回：不得覆盖已渲染的新结果
    await act(async () => {
      resolveStale(buildPage([buildRepairItem(1)]));
    });

    expect(screen.queryByText('RR-20260901-001')).toBeNull();
    expect(screen.getByText('RR-20260902-001')).toBeInTheDocument();
  });
});
