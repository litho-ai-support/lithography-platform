// src/pages/customer/repair-request-detail/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户维修申请详情页单测（页面层：只断言渲染与导航意图）。
 *
 * 加载状态机、删除命令、目标代次守卫与失败回刷的时序行为均由
 * feature application hook（useCustomerRepairRequestDetailFlow）承担，已在
 * src/features/repair-request/application/use-customer-repair-request-detail-flow.spec.ts 覆盖；
 * 本 spec 只验证页面把 hook 的 view state 渲染为正确 DOM，并按命令返回值装配导航意图。
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CustomerRepairRequestDetailState,
  RepairRequestDetail,
} from '@/features/repair-request';

import { MessageFeedbackProvider } from '@/shared/ui/message-feedback';

import { formatDate } from '../format-date';

import { CustomerRepairRequestDetailPage } from './index';

const { detailHook, navigateMock } = vi.hoisted(() => ({
  detailHook: {
    current: {
      state: { status: 'loading' } as unknown,
      deleting: false,
      deleteRequest: vi.fn(),
    },
  },
  navigateMock: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

// 只替换流程 hook：页面不再感知 adapter，RESOLUTION_STATUS_LABELS 等纯展示映射保留真实实现。
vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  return { ...actual, useCustomerRepairRequestDetailFlow: () => detailHook.current };
});

const deleteRequestMock = detailHook.current.deleteRequest;

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

/**
 * 当前可见 Popconfirm 内的确认按钮。
 *
 * AntD 弹层挂在 document.body 上，不随 RTL cleanup 移除（关闭后带 `.ant-popover-hidden`）。
 * 按文本查「确认删除」会命中跨用例残留的节点，故只认「可见容器内的确认按钮」。
 */
const visibleConfirmButtons = () =>
  Array.from(document.querySelectorAll('.ant-popover:not(.ant-popover-hidden)')).flatMap(
    (popover) => Array.from(popover.querySelectorAll('.ant-popconfirm-buttons .ant-btn-primary')),
  );

const deleteButton = () =>
  screen.getByRole('button', { name: /删\s*除\s*申\s*请/ }) as HTMLButtonElement;

/** 点「删除申请」并点击当前可见 Popconfirm 的确认按钮（不经文本查残留节点） */
async function confirmVisibleDelete() {
  fireEvent.click(deleteButton());
  await waitFor(() => expect(visibleConfirmButtons()).toHaveLength(1));
  fireEvent.click(visibleConfirmButtons()[0]);
}

/**
 * 以给定 view state 渲染详情页（deleting 可选，requestId 由路由层注入）。
 *
 * 页面经 `useMessageFeedback()` 消费反馈端口，Provider 是必要装配条件，
 * 故测试走真实 Provider wrapper，而不是让缺失 Provider 的装配回归假绿。
 */
function renderWithState(
  state: CustomerRepairRequestDetailState,
  options: { deleting?: boolean; requestId?: number } = {},
) {
  detailHook.current.state = state;
  detailHook.current.deleting = options.deleting ?? false;

  return render(
    <MessageFeedbackProvider>
      <CustomerRepairRequestDetailPage requestId={options.requestId ?? 920001} />
    </MessageFeedbackProvider>,
  );
}

describe('客户维修申请详情页', () => {
  beforeEach(() => {
    detailHook.current.state = { status: 'loading' };
    detailHook.current.deleting = false;
    deleteRequestMock.mockReset();
    navigateMock.mockReset();
  });

  it('渲染详情字段与回复时间线（只出现昵称，不出现账号 ID）', () => {
    renderWithState({ status: 'ready', detail: makeDetail() });

    expect(screen.getByText('MOCK-RR-2026-0001')).toBeTruthy();
    expect(screen.getByText('E-STAGE-201')).toBeTruthy();
    expect(screen.getByText('李工')).toBeTruthy();
    expect(screen.getByText('已接单，正在排查。')).toBeTruthy();
    expect(screen.queryByText(/engineerAccountId|accountId|920/)).toBeNull();
  });

  it('待接单详情展示删除入口', () => {
    renderWithState({ status: 'ready', detail: makeDetail() });

    expect(screen.getByRole('button', { name: /删\s*除\s*申\s*请/ })).toBeTruthy();
  });

  it('已接单详情不展示删除入口', () => {
    renderWithState({
      status: 'ready',
      detail: makeDetail({ isAccepted: true, acceptedAt: '2026-01-11T00:50:00.000Z' }),
    });

    expect(screen.queryByRole('button', { name: /删\s*除\s*申\s*请/ })).toBeNull();
  });

  it('删除进行中（deleting）删除入口进入 pending 态', () => {
    renderWithState({ status: 'ready', detail: makeDetail() }, { deleting: true });

    expect(deleteButton().disabled).toBe(true);
  });

  it('不存在 / 非本人 / 已删除统一呈现不可查看态与返回入口', () => {
    renderWithState({ status: 'failed', message: '维修申请不存在或不可查看。', notFound: true });

    expect(screen.getByText('维修申请不存在或不可查看。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回列表' }));
    expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests');
  });

  it('加载失败（transport 等）展示错误态，区别于不存在', () => {
    renderWithState({
      status: 'failed',
      message: '维修申请详情加载失败，请稍后重试。',
      notFound: false,
    });

    expect(screen.getByText('维修申请详情加载失败，请稍后重试。')).toBeTruthy();
  });

  it('删除成功（命令返回 true）后导航回列表页', async () => {
    renderWithState({ status: 'ready', detail: makeDetail() });
    deleteRequestMock.mockResolvedValue(true);

    await confirmVisibleDelete();

    await waitFor(() => {
      expect(deleteRequestMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/customer/repair-requests');
    });
  });

  it('删除失败（命令返回 false）不导航离开页面', async () => {
    renderWithState({ status: 'ready', detail: makeDetail() });
    deleteRequestMock.mockResolvedValue(false);

    await confirmVisibleDelete();

    await waitFor(() => expect(deleteRequestMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // S0 任务书：0 条回复时整个回复模块不渲染 —— 不得出现标题、计数或占位。
  it('0 条回复时整个回复模块不渲染：无标题、无计数、无空状态占位', () => {
    renderWithState({ status: 'ready', detail: makeDetail({ responses: [] }) });

    expect(screen.queryByText(/工程师回复/)).toBeNull();
    expect(screen.queryByText('暂无工程师回复。')).toBeNull();
    expect(screen.queryByText('李工')).toBeNull();
    expect(screen.queryByText('已接单，正在排查。')).toBeNull();
  });

  it('多条回复按后端给定顺序直接渲染不重排，状态标签与时间来自后端字段', () => {
    renderWithState({
      status: 'ready',
      detail: makeDetail({
        isAccepted: true,
        acceptedAt: '2026-01-11T00:50:00.000Z',
        responses: [
          {
            id: 960001,
            engineerNickname: '王工',
            resolutionStatus: 'PENDING',
            responseText: '排查中。',
            createdAt: '2026-01-11T01:00:00.000Z',
          },
          {
            id: 960002,
            engineerNickname: '李工',
            resolutionStatus: 'RESOLVED',
            responseText: '已解决。',
            createdAt: '2026-01-11T03:30:00.000Z',
          },
        ],
      }),
    });

    // 页面不重排：DOM 顺序与给定顺序一致（先到先显示，PENDING 在前）
    const pendingText = screen.getByText('排查中。');
    const resolvedText = screen.getByText('已解决。');
    expect(
      Boolean(pendingText.compareDocumentPosition(resolvedText) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.getByText('已解决')).toBeTruthy();
    expect(screen.getByText('处理中')).toBeTruthy();
    // S2-7：时间与工程师昵称均来自后端字段，按客户侧统一格式展示
    expect(screen.getByText(formatDate('2026-01-11T03:30:00.000Z'))).toBeTruthy();
    expect(screen.getByText(formatDate('2026-01-11T01:00:00.000Z'))).toBeTruthy();
    expect(screen.getByText('王工')).toBeTruthy();
  });

  // S2-5：故障描述与回复正文对长连续文本安全换行（几何断言在 e2e 视觉 spec）
  it('故障描述与回复正文携带换行类，不撑破页面', () => {
    renderWithState({
      status: 'ready',
      detail: makeDetail({
        faultDescription: 'E-201'.repeat(120),
        responses: [
          {
            id: 960001,
            engineerNickname: '李工',
            resolutionStatus: 'PENDING',
            responseText: 'a'.repeat(300),
            createdAt: '2026-01-11T01:00:00.000Z',
          },
        ],
      }),
    });

    expect(screen.getByText('E-201'.repeat(120)).classList.contains('break-words')).toBe(true);
    expect(screen.getByText('a'.repeat(300)).classList.contains('break-words')).toBe(true);
  });

  // S2-8：加载态使用与失败/不存在一致的页面骨架，面板内为骨架屏而非空白面板
  it('加载中呈现页头与骨架屏，不出现空白面板', () => {
    const { container } = renderWithState({ status: 'loading' });

    expect(screen.getByRole('heading', { name: '维修申请详情' })).toBeTruthy();
    const panel = container.querySelector('.surface-panel');
    expect(panel).not.toBeNull();
    expect(panel!.querySelector('.ant-skeleton')).not.toBeNull();
    expect(panel!.textContent).toBe('');
  });
});
