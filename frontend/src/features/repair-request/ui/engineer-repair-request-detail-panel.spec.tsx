// src/features/repair-request/ui/engineer-repair-request-detail-panel.spec.tsx
// @vitest-environment jsdom

// 编排/状态机逻辑由其自身实现覆盖；本测试只验证面板在各终态下的反馈取舍，
// 因此把编排 hook 桩成确定状态，不触碰真实 adapter 与 GraphQL。
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EngineerRepairRequestDetailState } from '../application/use-engineer-repair-request-detail';
import type {
  AcceptRepairRequestResult,
  CreateEngineerResponseResult,
  EngineerRepairRequestDetail,
  EngineerRepairRequestResponseItem,
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
  overrides: {
    submitting?: boolean;
    reconciling?: boolean;
    lastCreateResponseResult?: CreateEngineerResponseResult | null;
  } = {},
) {
  flowMock.mockReturnValue({
    accept: vi.fn(),
    accepting: false,
    lastAcceptResult,
    reload: vi.fn(),
    recheckSilently: recheckSilentlyMock,
    submitting: false,
    reconciling: false,
    lastCreateResponseResult: null,
    createResponse: createResponseMock,
    state,
    ...overrides,
  });
}

function isControlDisabled(element: HTMLElement): boolean {
  return (
    (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true'
  );
}

/**
 * 编排桩跨 setFlow 保持同一实例：面板重渲染时才能累加断言调用次数
 * （每次 setFlow 新建桩会让重渲染后的提交落到另一个桩上）。
 */
const createResponseMock = vi.fn();
const recheckSilentlyMock = vi.fn();

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

    render(<EngineerRepairRequestDetailPanel canHandleAsEngineer={true} requestId={123} />);

    // 冲突提示不被通用不可访问文案掩盖
    expect(screen.getByText(CONFLICT_MESSAGE)).toBeTruthy();
    // 统一不可访问反馈与返回引导仍然保留
    expect(screen.getByText(NOT_ACCESSIBLE_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: '返回维修申请列表' })).toBeTruthy();
    // 旧详情不继续展示，自然不残留可点击的接单按钮
    // antd 对两个汉字的按钮插入间距，accessible name 为「接 单」，必须用正则匹配
    expect(screen.queryByRole('button', { name: /接\s*单/ })).toBeNull();
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

    render(<EngineerRepairRequestDetailPanel canHandleAsEngineer={true} requestId={123} />);

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
  ])(
    'ready 状态（%s）：展示返回列表入口且点击后前往列表路径',
    (_label, canHandleAsEngineer, detail) => {
      setFlow({ detail, requestSeq: 1, status: 'ready' }, null);

      render(
        <EngineerRepairRequestDetailPanel
          canHandleAsEngineer={canHandleAsEngineer}
          requestId={123}
        />,
      );

      // 路径断言复用切片路径唯一真源，不在测试里重写字面量
      fireEvent.click(screen.getByRole('button', { name: '返回维修申请列表' }));
      expect(navigateMock).toHaveBeenCalledWith(ENGINEER_REPAIR_REQUEST_LIST_PATH);
    },
  );
});

/**
 * 回复区域（精确 ENGINEER 且已接单时展示）。
 * 编排 hook 桩成确定状态，验证权限矩阵、草稿归属、禁用态与反馈取舍。
 */
describe('工程师详情面板的回复区域', () => {
  beforeEach(() => {
    flowMock.mockReset();
    navigateMock.mockReset();
    createResponseMock.mockReset();
    recheckSilentlyMock.mockReset();
  });

  const ACCEPTED: EngineerRepairRequestDetailState = {
    detail: { ...READY_DETAIL, isAccepted: true },
    requestSeq: 1,
    status: 'ready',
  };
  const RESPONSE: EngineerRepairRequestResponseItem = {
    id: 61,
    engineerNickname: '陈工',
    resolutionStatus: 'PENDING',
    responseText: '已初步处理',
    createdAt: '2026-09-02T10:00:00.000Z',
  };
  const RESPONSE_FAILED_RESULT: CreateEngineerResponseResult = {
    ok: false,
    reason: 'response-failed',
    message: '处理回复失败，请稍后重试',
  };

  function renderPanel(canHandleAsEngineer: boolean) {
    const view = render(
      <EngineerRepairRequestDetailPanel
        canHandleAsEngineer={canHandleAsEngineer}
        requestId={123}
      />,
    );

    return {
      createMock: createResponseMock,
      recheckMock: recheckSilentlyMock,
      /** 重新 setFlow 后重渲染面板（模拟编排状态推进，表单不卸载） */
      rerenderPanel: () =>
        view.rerender(
          <EngineerRepairRequestDetailPanel
            canHandleAsEngineer={canHandleAsEngineer}
            requestId={123}
          />,
        ),
    };
  }

  function fillDraft(text = '已更换备件，待观察') {
    fireEvent.change(screen.getByLabelText('回复正文'), { target: { value: text } });
  }

  async function selectResolved() {
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('已解决'));
  }

  it('ENGINEER + 未接单：显示接单入口与先接单提示，不显示回复表单', () => {
    setFlow({ detail: READY_DETAIL, requestSeq: 1, status: 'ready' }, null);
    renderPanel(true);

    // antd 对两个汉字的按钮插入间距，accessible name 为「接 单」，用正则匹配
    expect(screen.getByRole('button', { name: /接\s*单/ })).toBeTruthy();
    expect(screen.getByText('请先接单后才能回复该申请。')).toBeTruthy();
    expect(screen.queryByLabelText('回复正文')).toBeNull();
    expect(screen.queryByRole('button', { name: /提交回复/ })).toBeNull();
  });

  it('ENGINEER + 已接单：显示回复表单，不再有接单入口', () => {
    setFlow(ACCEPTED, null);
    renderPanel(true);

    expect(screen.getByLabelText('回复正文')).toBeTruthy();
    expect(screen.getByRole('button', { name: /提交回复/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /接\s*单/ })).toBeNull();
  });

  it('SUPER_ADMIN + 已接单：只读，不显示回复表单与提交入口', () => {
    setFlow(ACCEPTED, null);
    renderPanel(false);

    expect(screen.getByText('当前账号仅可查看详情，回复需使用工程师账号。')).toBeTruthy();
    expect(screen.queryByLabelText('回复正文')).toBeNull();
    expect(screen.queryByRole('button', { name: /提交回复/ })).toBeNull();
  });

  it('正文与状态必填：空表单提交不触发 createResponse 且展示必填提示', async () => {
    setFlow(ACCEPTED, null);
    const { createMock } = renderPanel(true);

    fireEvent.click(screen.getByRole('button', { name: /提交回复/ }));

    expect(await screen.findByText('请输入回复正文。')).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('提交 payload 正确：requestId 来自详情，正文原样、状态为选择值', async () => {
    setFlow(ACCEPTED, null);
    const { createMock } = renderPanel(true);

    fillDraft();
    await selectResolved();
    fireEvent.click(screen.getByRole('button', { name: /提交回复/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      requestId: 123,
      responseText: '已更换备件，待观察',
      resolutionStatus: 'RESOLVED',
    });
  });

  it.each([
    ['提交中', { submitting: true }],
    ['自动收敛重查中', { reconciling: true, lastCreateResponseResult: RESPONSE_FAILED_RESULT }],
  ] as const)('%s：正文、状态与提交按钮禁用，防止输入与重复提交', (_label, overrides) => {
    setFlow(ACCEPTED, null, overrides);
    const { createMock } = renderPanel(true);

    expect(isControlDisabled(screen.getByLabelText('回复正文'))).toBe(true);
    expect(isControlDisabled(screen.getByRole('combobox'))).toBe(true);
    // antd 的 loading 按钮不加 disabled 属性（仅 loading 样式 + 内部拦截点击），
    // 因此断言 loading 态并验证点击不会产生提交
    const submitButton = screen.getByRole('button', { name: /提交回复/ });
    expect(submitButton).toHaveClass('ant-btn-loading');
    fireEvent.click(submitButton);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('自动收敛期间「重新加载详情」按钮禁用，不叠加并行手动重查', () => {
    setFlow(ACCEPTED, null, {
      reconciling: true,
      lastCreateResponseResult: RESPONSE_FAILED_RESULT,
    });
    renderPanel(true);

    expect(
      screen.getByText('回复可能已提交成功，请刷新后检查回复时间线，避免重复提交。'),
    ).toBeTruthy();
    expect(isControlDisabled(screen.getByRole('button', { name: '重新加载详情' }))).toBe(true);
  });

  it('成功后正文清空，状态重置为 PENDING（再次提交 payload 可验证）', async () => {
    setFlow(ACCEPTED, null);
    const { createMock, rerenderPanel } = renderPanel(true);

    fillDraft();
    await selectResolved();
    fireEvent.click(screen.getByRole('button', { name: /提交回复/ }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    // lastResult 收敛为成功 → 表单重置（重渲染模拟编排状态推进，表单不卸载）
    setFlow(ACCEPTED, null, { lastCreateResponseResult: { ok: true, response: RESPONSE } });
    rerenderPanel();

    expect((screen.getByLabelText('回复正文') as HTMLTextAreaElement).value).toBe('');

    // 状态选择重置为初始 PENDING：再次提交不改选择，payload 应为 PENDING
    fireEvent.change(screen.getByLabelText('回复正文'), { target: { value: '补充说明' } });
    fireEvent.click(screen.getByRole('button', { name: /提交回复/ }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ resolutionStatus: 'PENDING' }),
    );
  });

  it('确定失败后正文与状态草稿保留，用户无需重新输入', async () => {
    setFlow(ACCEPTED, null);
    const { createMock, rerenderPanel } = renderPanel(true);

    fillDraft();
    await selectResolved();
    fireEvent.click(screen.getByRole('button', { name: /提交回复/ }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    setFlow(ACCEPTED, null, {
      lastCreateResponseResult: {
        ok: false,
        reason: 'insufficient-permission',
        message: '仅工程师账号可以回复维修申请',
      },
    });
    rerenderPanel();

    expect((screen.getByLabelText('回复正文') as HTMLTextAreaElement).value).toBe(
      '已更换备件，待观察',
    );
    expect(screen.getByText('仅工程师账号可以回复维修申请')).toBeTruthy();
  });

  it('不确定且重查失败：草稿、当前详情与不确定提示都保留', async () => {
    const DETAIL_WITH_RESPONSE: EngineerRepairRequestDetailState = {
      detail: { ...READY_DETAIL, isAccepted: true, responses: [RESPONSE] },
      requestSeq: 1,
      status: 'ready',
    };
    setFlow(DETAIL_WITH_RESPONSE, null);
    const { rerenderPanel } = renderPanel(true);

    fillDraft();
    setFlow(DETAIL_WITH_RESPONSE, null, { lastCreateResponseResult: RESPONSE_FAILED_RESULT });
    rerenderPanel();

    // 草稿与详情时间线保留
    expect((screen.getByLabelText('回复正文') as HTMLTextAreaElement).value).toBe(
      '已更换备件，待观察',
    );
    expect(screen.getByText('已初步处理')).toBeTruthy();
    // 不确定提示保留，重查入口可用（未在收敛中）
    expect(
      screen.getByText('回复可能已提交成功，请刷新后检查回复时间线，避免重复提交。'),
    ).toBeTruthy();
    expect(isControlDisabled(screen.getByRole('button', { name: '重新加载详情' }))).toBe(false);
  });

  it('手动重新加载调用现有 recheckSilently，不调用 Mutation', async () => {
    setFlow(ACCEPTED, null, { lastCreateResponseResult: RESPONSE_FAILED_RESULT });
    const { createMock, recheckMock } = renderPanel(true);

    fireEvent.click(screen.getByRole('button', { name: '重新加载详情' }));

    expect(recheckMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });
});
