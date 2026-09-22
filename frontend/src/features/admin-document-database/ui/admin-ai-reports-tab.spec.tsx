// src/features/admin-document-database/ui/admin-ai-reports-tab.spec.tsx
// @vitest-environment jsdom

/**
 * AI 报告 Tab 页面级测试（R3 + R4）。
 *
 * R3：筛选控件在 FilterBar 内、各状态与表格分页同处 TableContainer 内、
 * 正文 Drawer 在容器外；筛选/分页/Drawer 可操作。
 * R4：默认空态「暂无 AI 报告。」、筛选空文案、请求参数与筛选状态一致。
 *
 * 只 mock 本 feature 的 adapter 模块，其余走真实组件与状态机。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminAiReportDetail,
  AdminAiReportListItem,
  AdminListPage,
} from '../infrastructure/admin-document-database.types';
import {
  fetchAdminAiReportDetail,
  fetchAdminAiReports,
} from '../infrastructure/admin-document-database-adapter';

import { AdminAiReportsTab } from './admin-ai-reports-tab';

vi.mock('../infrastructure/admin-document-database-adapter', async (importOriginal) => {
  type Adapter = typeof import('../infrastructure/admin-document-database-adapter');
  const actual = await importOriginal<Adapter>();

  return {
    ...actual,
    fetchAdminAiReports: vi.fn(),
    fetchAdminAiReportDetail: vi.fn(),
  };
});

const fetchReportsMock = vi.mocked(fetchAdminAiReports);
const fetchReportDetailMock = vi.mocked(fetchAdminAiReportDetail);

function buildReportItem(id: number): AdminAiReportListItem {
  return {
    id,
    conversationId: 1,
    requestId: id,
    requestNo: `RR-2026090${id}-001`,
    requestMismatch: false,
    reportType: 'FAULT_ANALYSIS',
    reportTitle: `报告标题 ${id}`,
    engineerNickname: '陈工程师',
    createdAt: '2026-09-03T09:00:00.000Z',
  };
}

function buildReportDetail(id: number): AdminAiReportDetail {
  return { ...buildReportItem(id), contentMd: `## 报告正文 ${id}` };
}

function buildPage<T>(items: T[], total = items.length, page = 1): AdminListPage<T> {
  return { items, total, page, pageSize: 10 };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchReportsMock.mockReset();
  fetchReportDetailMock.mockReset();

  fetchReportsMock.mockResolvedValue(buildPage([buildReportItem(1)]));
  fetchReportDetailMock.mockResolvedValue({ ok: true, detail: buildReportDetail(1) });
});

describe('AdminAiReportsTab（R3 视觉容器）', () => {
  it('筛选控件包在 FilterBar 内，loading 骨架在 TableContainer 内', async () => {
    const { container } = render(<AdminAiReportsTab />);

    const filterBar = container.querySelector('.filter-bar');
    expect(filterBar).not.toBeNull();
    expect(filterBar?.querySelector('input')).not.toBeNull();

    const tableContainer = container.querySelector('.table-container');
    expect(tableContainer).not.toBeNull();
    expect(tableContainer?.querySelector('.ant-skeleton')).not.toBeNull();

    // flush 初始取数的落定，避免测试结束后才 dispatch 的 act 警告
    await act(async () => {});
  });

  it('有数据：表格与分页在 TableContainer 内，正文 Drawer 在容器外且可打开', async () => {
    const { container } = render(<AdminAiReportsTab />);

    expect(await screen.findByText('报告标题 1')).toBeInTheDocument();
    const tableContainer = container.querySelector('.table-container');
    expect(tableContainer?.querySelector('table')).not.toBeNull();
    expect(tableContainer?.querySelector('.ant-pagination')).not.toBeNull();

    // AntD 两字按钮在中间插入全角空格（「正 文」），用正则容忍
    fireEvent.click(screen.getByRole('button', { name: /正\s*文/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('## 报告正文 1')).toBeInTheDocument();
    expect(fetchReportDetailMock).toHaveBeenCalledWith(1);
    expect(container.querySelector('.table-container .ant-drawer')).toBeNull();
  });

  it('加载失败：错误告警在 TableContainer 内呈现，重试可恢复数据', async () => {
    fetchReportsMock.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(<AdminAiReportsTab />);

    expect(await screen.findByText('AI 报告列表加载失败，请稍后重试。')).toBeInTheDocument();
    expect(container.querySelector('.table-container .ant-alert-error')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(await screen.findByText('报告标题 1')).toBeInTheDocument();
  });
});

describe('AdminAiReportsTab（R4 有效筛选单一真源）', () => {
  it('默认空（无筛选）：显示「暂无 AI 报告。」而非筛选空文案，请求参数为空对象', async () => {
    fetchReportsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiReportsTab />);

    expect(await screen.findByText('暂无 AI 报告。')).toBeInTheDocument();
    expect(screen.queryByText('没有符合筛选条件的 AI 报告。')).toBeNull();
    expect(fetchReportsMock).toHaveBeenCalledWith(1, 10, {});
  });

  it('真实筛选无结果：显示筛选空文案，请求变量保留筛选字段', async () => {
    fetchReportsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiReportsTab />);
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('按报告类型筛选'), {
      target: { value: 'FAULT' },
    });

    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchReportsMock).toHaveBeenLastCalledWith(1, 10, { reportType: 'FAULT' });
    expect(await screen.findByText('没有符合筛选条件的 AI 报告。')).toBeInTheDocument();
  });

  it('分页可操作：翻页请求回带 page=2', async () => {
    fetchReportsMock.mockResolvedValueOnce(buildPage([buildReportItem(1)], 25, 1));
    fetchReportsMock.mockResolvedValueOnce(buildPage([buildReportItem(5)], 25, 2));
    const { container } = render(<AdminAiReportsTab />);
    await screen.findByText('报告标题 1');

    const secondPage = container.querySelector('.ant-pagination-item-2 a');
    expect(secondPage).not.toBeNull();
    fireEvent.click(secondPage as HTMLElement);

    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledTimes(2));
    expect(fetchReportsMock).toHaveBeenLastCalledWith(2, 10, {});
    expect(await screen.findByText('报告标题 5')).toBeInTheDocument();
  });
});
