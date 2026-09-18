// src/features/admin-document-database/application/use-admin-document-detail.spec.ts
// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminAiReportDetail } from '../infrastructure/admin-document-database.types';

// 详情 hook 在 feature 内以相对路径 import adapter——mock 必须落在 adapter 模块
// 路径上（barrel mock 拦截不到，见 S3 页面 spec 同款处理）。
vi.mock(
  '@/features/admin-document-database/infrastructure/admin-document-database-adapter',
  async (importOriginal) => {
    type AdminAdapter =
      typeof import('@/features/admin-document-database/infrastructure/admin-document-database-adapter');
    const actual = await importOriginal<AdminAdapter>();

    return {
      ...actual,
      fetchAdminAiReportDetail: vi.fn(),
    };
  },
);

import { fetchAdminAiReportDetail } from '../infrastructure/admin-document-database-adapter';

import { useAdminAiReportDetail } from './use-admin-document-detail';

const mockFetchAdminAiReportDetail = vi.mocked(fetchAdminAiReportDetail);

// 模块级 mock 跨用例共享，调用计数需逐用例清零，否则 toHaveBeenCalledTimes 串味
beforeEach(() => {
  mockFetchAdminAiReportDetail.mockClear();
});

const REPORT_DETAIL: AdminAiReportDetail = {
  id: 950001,
  conversationId: 930001,
  requestId: 920002,
  requestNo: 'MOCK-RR-2026-0002',
  requestMismatch: false,
  reportType: 'FAULT_DIAGNOSIS',
  reportTitle: 'E-LASER-207 故障诊断报告',
  engineerNickname: '陈工',
  createdAt: '2026-01-11T16:12:00.000Z',
  contentMd: '# 结论',
};

/**
 * PR3 S4 回归：详情 hook 的 fetcher 引用稳定化。
 *
 * 消费方（useAdminAiReportDetail 等）内部每次渲染新建内联 fetcher；修复前 load
 * 直接依赖 fetcher，导致 effect 每渲染重新发请求、requestId 持续递增，所有已
 * 完成的响应被竞态校验丢弃，详情面板永远停留在 loading 骨架（Playwright 真实
 * 链路暴露的 S3 缺陷）。此处以「重渲染后调用数不变且最终 ready」锁死该行为。
 */
describe('useAdminAiReportDetail（fetcher 引用稳定化回归）', () => {
  it('fetcher 每渲染重建也只发起一次请求，并进入 ready', async () => {
    mockFetchAdminAiReportDetail.mockResolvedValue({ ok: true, detail: REPORT_DETAIL });
    const { result, rerender } = renderHook(
      ({ reportId }: { reportId: number | null }) => useAdminAiReportDetail(reportId),
      { initialProps: { reportId: 950001 as number | null } },
    );

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status !== 'ready') throw new Error('unreachable');
    expect(result.current.state.detail.reportTitle).toBe('E-LASER-207 故障诊断报告');

    // 触发重渲染（fetcher 引用随之重建）：不得追加请求
    rerender({ reportId: 950001 });
    await waitFor(() => expect(mockFetchAdminAiReportDetail).toHaveBeenCalledTimes(1));
    expect(result.current.state.status).toBe('ready');
  });

  it('targetId 变化时重新读取；业务拒绝进入 failed 并透出用户文案', async () => {
    mockFetchAdminAiReportDetail
      .mockResolvedValueOnce({ ok: true, detail: REPORT_DETAIL })
      .mockResolvedValueOnce({ ok: false, message: 'AI 报告不存在或不可查看。' });

    const { result, rerender } = renderHook(
      ({ reportId }: { reportId: number | null }) => useAdminAiReportDetail(reportId),
      { initialProps: { reportId: 950001 as number | null } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // 切换目标：恰好新发起一次读取（引用稳定不放大调用次数）
    rerender({ reportId: 950002 });
    await waitFor(() => expect(mockFetchAdminAiReportDetail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state.status).toBe('failed'));
    if (result.current.state.status !== 'failed') throw new Error('unreachable');
    expect(result.current.state.message).toBe('AI 报告不存在或不可查看。');

    // 关闭详情（targetId 回 null）不发起请求；再次打开是新的读取，恰好新发起一次
    rerender({ reportId: null });
    rerender({ reportId: 950002 });
    await waitFor(() => expect(mockFetchAdminAiReportDetail).toHaveBeenCalledTimes(3));
  });
});
