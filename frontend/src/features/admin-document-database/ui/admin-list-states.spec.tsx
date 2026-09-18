// src/features/admin-document-database/ui/admin-list-states.spec.tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminListState } from '../application/use-admin-document-list';

import { AdminListStates } from './admin-list-states';

/**
 * PR3 S5：列表四态渲染组件单测（加载 / 空 / 正常 / 失败，要求 3）。
 *
 * 四个标签共用本组件收口状态渲染。重点锁定：
 * - 加载态出骨架、失败态出可重试告警（点击回调触发）；
 * - 空态区分「默认为空」与「筛选结果为空」，各自断言明确文案；
 * - 正常态渲染 children，且空/骨架/告警三者互斥不并存。
 */
type Item = { id: number };

const EMPTY_LABEL = '暂无维修申请。';
const FILTERED_EMPTY_LABEL = '没有符合筛选条件的维修申请。';

const loadingState: AdminListState<Item> = { status: 'loading', requestSeq: 1 };
const readyWithData: AdminListState<Item> = {
  status: 'ready',
  requestSeq: 1,
  items: [{ id: 1 }],
  total: 1,
  page: 1,
  pageSize: 10,
};
const readyEmpty: AdminListState<Item> = {
  status: 'ready',
  requestSeq: 1,
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
};
const failedState: AdminListState<Item> = {
  status: 'failed',
  requestSeq: 1,
  message: '列表加载失败，请稍后重试。',
};

afterEach(() => {
  cleanup();
});

function renderStates(
  state: AdminListState<Item>,
  opts: { hasActiveFilter?: boolean; onRetry?: () => void } = {},
) {
  return render(
    <AdminListStates<Item>
      emptyLabel={EMPTY_LABEL}
      filteredEmptyLabel={FILTERED_EMPTY_LABEL}
      hasActiveFilter={opts.hasActiveFilter ?? false}
      onRetry={opts.onRetry ?? vi.fn()}
      state={state}
    >
      <div data-testid="table-body">表格内容</div>
    </AdminListStates>,
  );
}

describe('AdminListStates', () => {
  it('加载态：渲染骨架屏，不渲染表格/空态/告警', () => {
    const { container } = renderStates(loadingState);

    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('table-body')).toBeNull();
    expect(screen.queryByText(EMPTY_LABEL)).toBeNull();
    expect(screen.queryByText(failedState.message)).toBeNull();
  });

  it('失败态：渲染错误告警文案，点「重试」触发 onRetry', () => {
    const onRetry = vi.fn();
    const { container } = renderStates(failedState, { onRetry });

    expect(container.querySelector('.ant-alert-error')).not.toBeNull();
    expect(screen.getByText(failedState.message)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('正常态：渲染 children，不出现空态/骨架/告警', () => {
    const { container } = renderStates(readyWithData);

    expect(screen.getByTestId('table-body')).toBeInTheDocument();
    expect(container.querySelector('.ant-skeleton')).toBeNull();
    expect(screen.queryByText(EMPTY_LABEL)).toBeNull();
  });

  it('空态（无筛选）：断言默认空文案「暂无维修申请。」', () => {
    renderStates(readyEmpty, { hasActiveFilter: false });

    expect(screen.getByText(EMPTY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(FILTERED_EMPTY_LABEL)).toBeNull();
    expect(screen.queryByTestId('table-body')).toBeNull();
  });

  it('空态（有筛选）：断言筛选空文案「没有符合筛选条件的维修申请。」', () => {
    renderStates(readyEmpty, { hasActiveFilter: true });

    expect(screen.getByText(FILTERED_EMPTY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_LABEL)).toBeNull();
  });
});
