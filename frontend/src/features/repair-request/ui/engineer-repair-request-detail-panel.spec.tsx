// src/features/repair-request/ui/engineer-repair-request-detail-panel.spec.tsx
// @vitest-environment jsdom

// 编排/状态机逻辑由其自身实现覆盖；本测试只验证面板在各终态下的反馈取舍，
// 因此把编排 hook 桩成确定状态，不触碰真实 adapter 与 GraphQL。
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineerRepairRequestDetailState } from '../application/use-engineer-repair-request-detail';
import type {
  AcceptRepairRequestResult,
  EngineerRepairRequestDetail,
} from '../infrastructure/engineer-repair-request.types';

import { EngineerRepairRequestDetailPanel } from './engineer-repair-request-detail-panel';
import { ENGINEER_REPAIR_REQUEST_LIST_PATH } from './engineer-repair-request-paths';

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

const READY_DETAIL: EngineerRepairRequestDetail = {
  id: 123,
  requestNo: 'RR-20260902-001',
  errorCode: 'E-0001',
  faultDescription: '光刻机对准模块异常。',
  contentMd: '',
  createdAt: '2026-09-02T08:00:00.000Z',
  isAccepted: false,
  acceptedAt: null,
  latestResolutionStatus: null,
  equipmentModel: { id: 1, modelCode: 'LITHO-100', modelName: '样例光刻机' },
  responses: [],
};

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

/**
 * ready 状态下「返回维修申请列表」按钮与接单状态、查看者角色无关，
 * 以参数化覆盖典型组合，断言固定前往列表路径。
 */
describe('工程师详情面板的返回列表入口', () => {
  beforeEach(() => {
    flowMock.mockReset();
    navigateMock.mockReset();
  });

  const ACCEPTED_DETAIL: EngineerRepairRequestDetail = {
    ...READY_DETAIL,
    isAccepted: true,
    acceptedAt: '2026-09-02T09:00:00.000Z',
  };

  it.each([
    ['可接单工程师、未接单', true, READY_DETAIL],
    ['只读账号、未接单', false, READY_DETAIL],
    ['可接单工程师、已接单', true, ACCEPTED_DETAIL],
  ])('ready 状态（%s）：展示返回列表入口且点击后前往列表路径', (_label, canAccept, detail) => {
    setFlow({ detail, requestSeq: 1, status: 'ready' }, null);

    render(<EngineerRepairRequestDetailPanel canAccept={canAccept} requestId={123} />);

    // 路径断言复用切片路径唯一真源，不在测试里重写字面量
    fireEvent.click(screen.getByRole('button', { name: '返回维修申请列表' }));
    expect(navigateMock).toHaveBeenCalledWith(ENGINEER_REPAIR_REQUEST_LIST_PATH);
  });
});
