// src/pages/customer/repair-request-detail/index.spec.tsx
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepairRequestDetail } from '@/features/repair-request';

import { GraphQLIngressError } from '@/shared/graphql';

import { CustomerRepairRequestDetailPage } from './index';

const { deleteMock, fetchDetailMock, navigateMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  fetchDetailMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  return {
    ...actual,
    deleteMyRepairRequest: deleteMock,
    fetchMyRepairRequest: fetchDetailMock,
  };
});

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
    responses: [
      {
        id: 960001,
        engineerNickname: '李工',
        resolutionStatus: 'PENDING',
        responseText: '已接单，正在排查。',
        createdAt: '2026-01-11T01:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('客户维修申请详情页', () => {
  beforeEach(() => {
    vi.spyOn(message, 'success')
      .mockImplementation(() => undefined as never)
      .mockClear();
    vi.spyOn(message, 'error')
      .mockImplementation(() => undefined as never)
      .mockClear();
    deleteMock.mockReset();
    fetchDetailMock.mockReset();
    navigateMock.mockReset();
  });

  it('渲染详情字段与回复时间线（只出现昵称，不出现账号 ID）', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    render(<CustomerRepairRequestDetailPage requestId={920001} />);

    expect(await screen.findByText('MOCK-RR-2026-0001')).toBeTruthy();
    expect(screen.getByText('E-STAGE-201')).toBeTruthy();
    expect(screen.getByText('李工')).toBeTruthy();
    expect(screen.getByText('已接单，正在排查。')).toBeTruthy();
    expect(screen.queryByText(/engineerAccountId|accountId|920/)).toBeNull();
  });

  it('待接单详情展示删除入口', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    expect(screen.getByRole('button', { name: /删\s*除\s*申\s*请/ })).toBeTruthy();
  });

  it('已接单详情不展示删除入口', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({ id: 920002, isAccepted: true, acceptedAt: '2026-01-11T00:50:00.000Z' }),
    });
    render(<CustomerRepairRequestDetailPage requestId={920002} />);
    await screen.findByText('MOCK-RR-2026-0001');

    expect(screen.queryByRole('button', { name: /删\s*除\s*申\s*请/ })).toBeNull();
  });

  it('不存在 / 非本人 / 已删除统一呈现不可查看态与返回入口', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: false,
      reason: 'not-found',
      message: '维修申请不存在或不可查看。',
    });
    render(<CustomerRepairRequestDetailPage requestId={999999} />);

    expect(await screen.findByText('维修申请不存在或不可查看。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests');
  });

  it('加载失败（transport 等）展示错误态，区别于不存在', async () => {
    fetchDetailMock.mockRejectedValue(new Error('network'));
    render(<CustomerRepairRequestDetailPage requestId={920001} />);

    expect(await screen.findByText('维修申请详情加载失败，请稍后重试。')).toBeTruthy();
  });

  it('删除成功后回列表页', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockResolvedValue({ ok: true });
    render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    fireEvent.click(screen.getByRole('button', { name: /删\s*除\s*申\s*请/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith(920001);
      expect(message.success).toHaveBeenCalledWith('维修申请已删除。');
      expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests');
    });
  });

  it('删除失败展示明确原因并刷新详情，不离开页面', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockResolvedValue({
      ok: false,
      reason: 'already-accepted',
      message: '该申请已被工程师接单，不能删除。',
    });
    render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    fireEvent.click(screen.getByRole('button', { name: /删\s*除\s*申\s*请/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('该申请已被工程师接单，不能删除。');
      // 失败后刷新详情：首次加载 + 删除失败后重拉
      expect(fetchDetailMock.mock.calls.length).toBe(2);
      expect(navigateMock).not.toHaveBeenCalledWith('/customer/repair-requests');
    });
  });

  it('删除 transport 失败展示共享错误模型文案并刷新详情', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    deleteMock.mockRejectedValue(new GraphQLIngressError({ type: 'network', message: 'offline' }));
    render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    fireEvent.click(screen.getByRole('button', { name: /删\s*除\s*申\s*请/ }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('网络连接异常，请稍后重试。');
      expect(fetchDetailMock.mock.calls.length).toBe(2);
      expect(navigateMock).not.toHaveBeenCalledWith('/customer/repair-requests');
    });
  });

  it('尚无回复时保留区块标题并呈现明确空状态，不渲染回复项', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({ responses: [] }),
    });
    render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    // 区块标题保留且计数为 0，空状态文案明确可见
    expect(screen.getByText('工程师回复（0）')).toBeTruthy();
    expect(screen.getByText('暂无工程师回复。')).toBeTruthy();
    // 不渲染任何回复项内容
    expect(screen.queryByText('李工')).toBeNull();
    expect(screen.queryByText('已接单，正在排查。')).toBeNull();
  });

  it('多条回复按后端给定顺序直接渲染不重排，PENDING 与 RESOLVED 标签正确', async () => {
    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({
        isAccepted: true,
        acceptedAt: '2026-01-11T00:50:00.000Z',
        responses: [
          {
            id: 960002,
            engineerNickname: '李工',
            resolutionStatus: 'RESOLVED',
            responseText: '已解决。',
            createdAt: '2026-01-11T03:30:00.000Z',
          },
          {
            id: 960001,
            engineerNickname: '王工',
            resolutionStatus: 'PENDING',
            responseText: '排查中。',
            createdAt: '2026-01-11T01:00:00.000Z',
          },
        ],
      }),
    });
    render(<CustomerRepairRequestDetailPage requestId={920002} />);
    await screen.findByText('李工');

    // 页面不重排：DOM 顺序与给定顺序一致（RESOLVED 在前）
    const resolvedText = screen.getByText('已解决。');
    const pendingText = screen.getByText('排查中。');
    expect(
      Boolean(resolvedText.compareDocumentPosition(pendingText) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.getByText('已解决')).toBeTruthy();
    expect(screen.getByText('处理中')).toBeTruthy();
  });

  it('requestId 变化时重新加载详情', async () => {
    fetchDetailMock.mockResolvedValue({ ok: true, detail: makeDetail() });
    const { rerender } = render(<CustomerRepairRequestDetailPage requestId={920001} />);
    await screen.findByText('MOCK-RR-2026-0001');

    fetchDetailMock.mockResolvedValue({
      ok: true,
      detail: makeDetail({ id: 920003, requestNo: 'MOCK-RR-2026-0003' }),
    });
    rerender(<CustomerRepairRequestDetailPage requestId={920003} />);

    await screen.findByText('MOCK-RR-2026-0003');
    expect(fetchDetailMock).toHaveBeenLastCalledWith(920003);
  });
});
