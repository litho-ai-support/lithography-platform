// src/features/repair-request/ui/customer-repair-request-list-panel.spec.tsx
// @vitest-environment jsdom

/**
 * 客户工作台左栏「我的维修申请」活动列表面板单测（纯展示组件）。
 *
 * 面板只接收稳定 view state 与回调：本 spec 覆盖条目渲染、active 高亮、
 * 删除入口条件、分页装配、失败/空库/越界空页状态与键盘可达的语义化按钮；
 * 列表 query / 删除时序由 application hook spec 覆盖，不在本层重复。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerRepairRequestListView,
  RepairRequestListItem,
  RepairRequestListPage,
} from '@/features/repair-request';

import { CustomerRepairRequestListPanel } from './customer-repair-request-list-panel';

function makeItem(
  id: number,
  overrides: Partial<RepairRequestListItem> = {},
): RepairRequestListItem {
  return {
    id,
    requestNo: `MOCK-RR-2026-${String(id).slice(-4)}`,
    errorCode: 'E-STAGE-201',
    createdAt: '2026-01-10T00:30:00.000Z',
    isAccepted: false,
    acceptedAt: null,
    latestResolutionStatus: null,
    equipmentModel: { id: 48, modelCode: 'M1', modelName: '型号一' },
    ...overrides,
  };
}

function makePage(overrides?: Partial<RepairRequestListPage>): RepairRequestListPage {
  return {
    items: [
      makeItem(920001),
      makeItem(920002, {
        requestNo: 'MOCK-RR-2026-0002',
        errorCode: 'E-LENS-102',
        createdAt: '2026-01-11T00:30:00.000Z',
        isAccepted: true,
        acceptedAt: '2026-01-11T00:50:00.000Z',
        latestResolutionStatus: 'RESOLVED',
      }),
    ],
    total: 2,
    page: 1,
    pageSize: 10,
    ...overrides,
  };
}

const onDeleteMock = vi.fn();
const onGoToPageMock = vi.fn();
const onCreateRequestMock = vi.fn();
const onOpenMyRequestsMock = vi.fn();
const onRetryMock = vi.fn();
const onSelectMock = vi.fn();

function renderPanel(
  state: CustomerRepairRequestListView,
  options: { deletingId?: null | number; selectedRequestId?: null | number } = {},
) {
  return render(
    <CustomerRepairRequestListPanel
      deletingId={options.deletingId ?? null}
      onCreateRequest={onCreateRequestMock}
      onDelete={onDeleteMock}
      onGoToPage={onGoToPageMock}
      onOpenMyRequests={onOpenMyRequestsMock}
      onRetry={onRetryMock}
      onSelect={onSelectMock}
      selectedRequestId={options.selectedRequestId ?? null}
      state={state}
    />,
  );
}

/** 当前可见 Popconfirm 内的确认按钮（弹层挂 body，过滤隐藏残留节点） */
const visibleConfirmButtons = () =>
  Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')).flatMap(
    (popover) => Array.from(popover.querySelectorAll('.ant-popconfirm-buttons .ant-btn-primary')),
  );

beforeEach(() => {
  onDeleteMock.mockReset();
  onGoToPageMock.mockReset();
  onCreateRequestMock.mockReset();
  onOpenMyRequestsMock.mockReset();
  onRetryMock.mockReset();
  onSelectMock.mockReset();
});

describe('CustomerRepairRequestListPanel', () => {
  it('就绪态渲染活动条目：编号、型号（代码）· 错误码、提交时间与接单状态', () => {
    renderPanel({ status: 'ready', data: makePage() });

    expect(screen.getByText('MOCK-RR-2026-0001')).toBeTruthy();
    expect(screen.getByText('型号一（M1）· E-STAGE-201')).toBeTruthy();
    expect(screen.getByText('待接单')).toBeTruthy();
    expect(screen.getByText('已接单')).toBeTruthy();
    // 卡头显示真实总数
    expect(screen.getByText(/共\s*2\s*项/)).toBeTruthy();
  });

  it('选中项由 aria-current 表达，点击条目回调记录 id', () => {
    renderPanel({ status: 'ready', data: makePage() }, { selectedRequestId: 920001 });

    const selected = screen.getByText('MOCK-RR-2026-0001').closest('button') as HTMLElement;
    const other = screen.getByText('MOCK-RR-2026-0002').closest('button') as HTMLElement;

    expect(selected.closest('.activity-item')?.getAttribute('aria-current')).toBe('true');
    expect(other.closest('.activity-item')?.getAttribute('aria-current')).toBeNull();

    fireEvent.click(other);
    expect(onSelectMock).toHaveBeenCalledWith(920002);
  });

  it('未接单条目提供删除入口（确认后回调 id），已接单条目完全不渲染删除操作', async () => {
    renderPanel({ status: 'ready', data: makePage() });

    expect(screen.getByRole('button', { name: '删除申请 MOCK-RR-2026-0001' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '删除申请 MOCK-RR-2026-0002' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '删除申请 MOCK-RR-2026-0001' }));
    await waitFor(() => expect(visibleConfirmButtons()).toHaveLength(1));
    fireEvent.click(visibleConfirmButtons()[0]);

    expect(onDeleteMock).toHaveBeenCalledWith(920001);
  });

  it('删除进行中禁用所有条目的删除按钮', () => {
    renderPanel(
      {
        status: 'ready',
        data: makePage({ items: [makeItem(920001), makeItem(920003)], total: 2 }),
      },
      { deletingId: 920001 },
    );

    const deleteButtons = screen.getAllByRole('button', { name: /^删除申请 / });

    expect(deleteButtons).toHaveLength(2);

    for (const button of deleteButtons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('卡头「我的维修申请」是语义化按钮，点击触发入口回调', () => {
    renderPanel({ status: 'ready', data: makePage() });

    const heading = screen.getByRole('button', { name: '我的维修申请' });
    expect(heading.closest('.data-card-header')).not.toBeNull();

    fireEvent.click(heading);
    expect(onOpenMyRequestsMock).toHaveBeenCalledTimes(1);
  });

  it('加载中不提前渲染空态文案', () => {
    const { container } = renderPanel({ status: 'loading' });

    expect(container.querySelector('.ant-spin-spinning')).not.toBeNull();
    expect(screen.queryByText(/还没有维修申请/)).toBeNull();
  });

  it('失败态只呈现失败信息与重试入口，不叠加空态', () => {
    renderPanel({ status: 'failed', message: '维修申请列表加载失败，请稍后重试。' });

    expect(screen.getByText('维修申请列表加载失败，请稍后重试。')).toBeTruthy();
    expect(screen.queryByText(/还没有维修申请/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });

  it('空库态给出正式空态与发起申请主操作', () => {
    renderPanel({ status: 'ready', data: makePage({ items: [], total: 0 }) });

    expect(screen.getByText('还没有维修申请。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '发起维修申请' }));
    expect(onCreateRequestMock).toHaveBeenCalledTimes(1);
  });

  it('越界空页提示可恢复且分页保留（total>0 恒显示分页）', () => {
    const { container } = renderPanel({
      status: 'ready',
      data: makePage({ items: [], total: 12 }),
    });

    expect(screen.getByText('当前页暂无申请，请切换页码查看。')).toBeTruthy();
    expect(container.querySelector('.ant-pagination')).not.toBeNull();
  });

  it('翻页以新的分页参数回调 goToPage', () => {
    renderPanel({ status: 'ready', data: makePage({ total: 11 }) });

    fireEvent.click(screen.getByTitle('2'));
    expect(onGoToPageMock).toHaveBeenCalledWith(2, 10);
  });

  it('长连续文本携带换行类，不撑破左栏', () => {
    renderPanel({
      status: 'ready',
      data: makePage({
        items: [
          makeItem(920001, {
            requestNo: 'RR'.repeat(60),
            errorCode: 'E-201'.repeat(40),
          }),
        ],
        total: 1,
      }),
    });

    expect(screen.getByText('RR'.repeat(60)).classList.contains('break-all')).toBe(true);
    expect(screen.getByText(/E-201/).classList.contains('break-words')).toBe(true);
  });
});
