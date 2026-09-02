// src/features/repair-request/ui/engineer-repair-request-detail-panel.spec.tsx
// @vitest-environment jsdom

// 编排/状态机逻辑由其自身实现覆盖；本测试只验证面板在各终态下的反馈取舍，
// 因此把编排 hook 桩成确定状态，不触碰真实 adapter 与 GraphQL。
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineerRepairRequestDetailState } from '../application/use-engineer-repair-request-detail';
import type { AcceptRepairRequestResult } from '../infrastructure/engineer-repair-request.types';

import { EngineerRepairRequestDetailPanel } from './engineer-repair-request-detail-panel';

const { flowMock, navigateMock } = vi.hoisted(() => ({
  flowMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../application/use-engineer-repair-request-detail-flow', () => ({
  useEngineerRepairRequestDetailFlow: () => flowMock(),
}));

const CONFLICT_MESSAGE = '该维修申请已被接单，请刷新后查看最新状态';
const NOT_ACCESSIBLE_MESSAGE = '维修申请不存在，或当前账号无权查看。';

function setFlow(
  state: EngineerRepairRequestDetailState,
  lastAcceptResult: AcceptRepairRequestResult | null,
) {
  flowMock.mockReturnValue({
    accept: vi.fn(),
    accepting: false,
    lastAcceptResult,
    reload: vi.fn(),
    state,
  });
}

describe('工程师详情面板的接单冲突反馈', () => {
  beforeEach(() => {
    flowMock.mockReset();
    navigateMock.mockReset();
  });

  it('接单冲突后重查变为不可访问：仍优先展示冲突提示，并保留返回列表引导', () => {
    setFlow(
      {
        message: NOT_ACCESSIBLE_MESSAGE,
        reason: 'not-accessible',
        requestSeq: 2,
        status: 'failed',
      },
      { message: CONFLICT_MESSAGE, ok: false, reason: 'already-accepted' },
    );

    render(<EngineerRepairRequestDetailPanel canAccept={true} requestId={123} />);

    // 冲突提示不被通用不可访问文案掩盖
    expect(screen.getByText(CONFLICT_MESSAGE)).toBeTruthy();
    // 统一不可访问反馈与返回引导仍然保留
    expect(screen.getByText(NOT_ACCESSIBLE_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回维修申请列表' })).toBeTruthy();
    // 旧详情不继续展示，自然不残留可点击的接单按钮
    expect(screen.queryByRole('button', { name: '接单' })).toBeNull();
  });

  it('无接单反馈的不可访问态：仅展示统一不可访问反馈', () => {
    setFlow(
      {
        message: NOT_ACCESSIBLE_MESSAGE,
        reason: 'not-accessible',
        requestSeq: 1,
        status: 'failed',
      },
      null,
    );

    render(<EngineerRepairRequestDetailPanel canAccept={true} requestId={123} />);

    expect(screen.getByText(NOT_ACCESSIBLE_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(CONFLICT_MESSAGE)).toBeNull();
    expect(screen.getByRole('button', { name: '返回维修申请列表' })).toBeTruthy();
  });
});
