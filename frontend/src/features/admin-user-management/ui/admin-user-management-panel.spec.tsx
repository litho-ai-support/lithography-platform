// src/features/admin-user-management/ui/admin-user-management-panel.spec.tsx
// @vitest-environment jsdom

/**
 * 面板侧弹窗会话代次守卫（双层守卫的外层）。
 *
 * 弹窗侧的 `useStaleSubmitGuard` 只能保护弹窗自己的错误区；「关闭弹窗」这个动作归属面板，
 * 一旦认错会话就会出现 A 的成功关掉 B、或者关掉「切换走的同一个 A」。
 * 只核对 accountId 守不住后者——切走再切回来 accountId 完全相同，
 * 唯一能区分第几代会话的是单调代次。
 *
 * 走真实的 `useAdminUserList` / `useAdminUserCommands`（含 in-flight 锁与成功 reload），
 * 只替换最外层的 GraphQL adapter；时序全部由可控 deferred 推进，不使用 sleep，不扩大 timeout。
 *
 * 关于驱动方式：面板把 `submitting` 接到了 `commands.isPending(key)`，而 antd 6.4.3 的
 * `Modal.handleCancel` 在 `confirmLoading` 为真时直接 `return`（取消按钮、X、遮罩、Esc 共用它），
 * 所以「提交期间点取消关闭弹窗」在面板里不会发生，本 spec 不伪造这条路径。
 * 会话代次守卫针对的是**会话被推进**这件事本身，与推进来源无关，
 * 因此改用面板自己的行入口推进会话（A → B、A → B → A），
 * 覆盖守卫真正要保证的不变量：续体回来时代次已变 ⇒ 不得关闭当前弹窗、不得写错误区。
 *
 * 「关闭后重新打开同一个弹窗」这条推进来源在本 spec 里不可达（同一个 antd 门禁），
 * 同理 antd `Button` 在 loading 期间会直接吞掉 click，而在途提交把 OK 按钮置为 loading，
 * 所以「新一代弹窗已有错误 + 旧结果晚到」也无法在这里驱动；
 * 两者由弹窗组件层的 spec 以 `submitting={false}` 覆盖。
 * 创建弹窗的「提交期间关闭 + 重开」另由 `admin-user-management-panel-create-session.spec.tsx`
 * 用受控替身直测面板的 create 会话代次接线，那里同样不宣称该序列对真实用户可达。
 * 本 spec 用可达的「切走再切回同一个 accountId」等价推进会话，并钉住另一侧一致性：
 * 会话身份没变的重入**不得**推进代次，否则在途提交会被误判成陈旧。
 *
 * 关于「旧请求在 B 的 commit / layout effect 之前完成」这个窗口：它对外层不成立，
 * 也不靠 `useLayoutEffect` 的时序来排除。`openRowDialog` 是**先**同步改 ref
 * （`dialogSession.advance(key)`）**再** `setRow(row)`，代次在 React 开始渲染 B 之前就已推进，
 * 而「关闭 B」这个决定完全由外层代次作出（该同步性由 `use-dialog-session-seq.spec.ts` 直测钉住）。
 * 弹窗侧错误区另有两道与此窗口无关的保护：render 阶段的「按 props 调整 state」在同一次 render
 * 里就清掉上一代错误；而 discrete 事件的 render + commit + layout effect 在事件处理器内同步跑完，
 * 外部续体（微任务）无法插入其间。所以「commit 之前」这一半在测试里不可构造，
 * 现有 A → B 用例覆盖的已是能构造出的最早时刻——续体在切换提交完成之后立即运行。
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminUserCommandResult,
  AdminUserListPage,
  AdminUserPasswordResetResult,
  AdminUserRow,
} from '../application/admin-user-management.types';
import * as adminUserAdapter from '../infrastructure/admin-user-adapter';

import { AdminUserManagementPanel } from './admin-user-management-panel';

vi.mock('../infrastructure/admin-user-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof adminUserAdapter>();

  return {
    ...actual,
    adminCreateUser: vi.fn(),
    adminResetUserPassword: vi.fn(),
    adminSetUserStatus: vi.fn(),
    adminUpdateUserProfile: vi.fn(),
    fetchAdminUsers: vi.fn(),
  };
});

const fetchUsersMock = vi.mocked(adminUserAdapter.fetchAdminUsers);
const createMock = vi.mocked(adminUserAdapter.adminCreateUser);
const updateProfileMock = vi.mocked(adminUserAdapter.adminUpdateUserProfile);
const setStatusMock = vi.mocked(adminUserAdapter.adminSetUserStatus);
const resetPasswordMock = vi.mocked(adminUserAdapter.adminResetUserPassword);

const CREATE_DIALOG_TITLE = '创建用户';
/** 后端固定安全提示由 adapter 返回，面板逐字透传，密码本身不出现在任何反馈中 */
const RESET_NOTICE = '密码已重置，请通过线下渠道告知用户新的初始密码。';
const STALE_FAILURE_MESSAGE = '上一代目标的失败信息';
const BUSINESS_FAILURE_MESSAGE = '后端返回的业务失败信息';

const ROW_A: AdminUserRow = {
  accountId: 910001,
  companyName: '甲公司',
  contactEmail: 'a-contact@example.com',
  createdAt: '2026-09-01T08:00:00.000Z',
  loginEmail: 'user_a@example.com',
  loginName: 'user_a',
  nickname: '用户A',
  phone: '13800000001',
  role: 'ENGINEER',
  status: 'ACTIVE',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

const ROW_B: AdminUserRow = {
  accountId: 910002,
  companyName: '乙公司',
  contactEmail: 'b-contact@example.com',
  createdAt: '2026-09-02T08:00:00.000Z',
  loginEmail: 'user_b@example.com',
  loginName: 'user_b',
  nickname: '用户B',
  phone: '13800000002',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  updatedAt: '2026-09-02T08:00:00.000Z',
};

/** 可控 deferred：用显式 resolve 推进时序，不依赖 sleep 也不扩大 timeout */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

/**
 * 按标题文本反查弹窗容器，不用 `getByRole('dialog', { name })`。
 *
 * 测试环境下 `@rc-component/util` 的 `useId` 恒返回 `'test-id'`，于是面板工具条上的 Select
 * 与 rc-dialog 的标题元素共用同一个 `id`；`aria-labelledby` 会解析到文档里第一个同 id 元素
 * （工具条 Select，值为空），弹窗的 accessible name 因此恒为空串，按 name 取不到。
 * 标题元素带 `.ant-modal-title`，限定 selector 后可以精确命中且不撞到工具条上的同名按钮。
 */
function queryDialog(title: string): HTMLElement | null {
  const titleNode = screen.queryByText(title, { selector: '.ant-modal-title' });

  return (titleNode?.closest('[role="dialog"]') as HTMLElement | null) ?? null;
}

function getDialog(title: string): HTMLElement {
  const dialog = queryDialog(title);

  if (dialog === null) {
    throw new Error(`未找到标题为「${title}」的弹窗`);
  }

  return dialog;
}

/**
 * 弹窗是否仍处于打开态。
 *
 * 不能用「DOM 消失」判定：jsdom 不派发 `transitionend`，rc-motion 的离场永远停在
 * `ant-zoom-leave-*` 中间态，`destroyOnHidden` 要等 `afterClose` 才生效，
 * 关闭后的弹窗 DOM 与标题文本都会原地滞留。改用 rc-motion 的状态 class：
 * `open` 翻转为 false 的同一次提交里容器就会带上 `-leave`，同步且确定。
 */
function isDialogOpen(title: string): boolean {
  const dialog = queryDialog(title);

  return dialog !== null && !dialog.className.includes('-leave');
}

function makePage(): AdminUserListPage {
  return { items: [ROW_A, ROW_B], page: 1, pageSize: 10, total: 2 };
}

async function renderPanel() {
  render(<AdminUserManagementPanel />);

  await screen.findByText(ROW_A.nickname);
  await screen.findByText(ROW_B.nickname);
}

/** 表格行内的写入口：按昵称定位行，避免命中其它行的同名按钮 */
function clickRowAction(nickname: string, actionName: RegExp) {
  const row = screen.getByText(nickname).closest('tr') as HTMLElement;

  fireEvent.click(within(row).getByRole('button', { name: actionName }));
}

function clickDialogButton(dialog: HTMLElement, name: RegExp) {
  fireEvent.click(within(dialog).getByRole('button', { name }));
}

/**
 * 打开创建弹窗并填出一份能通过校验的草稿。
 *
 * 角色下拉的选项渲染在 body 层的 portal 里，而列表中「客户」角色标签也是同一段文本，
 * 因此选项必须限定在已展开的 `.ant-select-dropdown` 内查找，不能直接 `screen.findByText`。
 */
async function openCreateDialogAndFill(draft: { loginName: string; nickname: string }) {
  fireEvent.click(screen.getByRole('button', { name: /创\s*建\s*用\s*户/ }));

  const dialog = getDialog(CREATE_DIALOG_TITLE);
  fireEvent.mouseDown(within(dialog).getByRole('combobox'));

  const dropdown = await waitFor(() => {
    const opened = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

    if (opened === null) {
      throw new Error('创建弹窗的角色下拉未展开');
    }

    return opened as HTMLElement;
  });
  fireEvent.click(within(dropdown).getByText('客户'));

  fireEvent.change(within(dialog).getByLabelText('昵称'), { target: { value: draft.nickname } });
  fireEvent.change(within(dialog).getByLabelText('登录名（登录凭据之一）'), {
    target: { value: draft.loginName },
  });
  fireEvent.change(within(dialog).getByLabelText('初始密码'), {
    target: { value: 'Valid-create9!' },
  });
  fireEvent.change(within(dialog).getByLabelText('确认初始密码'), {
    target: { value: 'Valid-create9!' },
  });

  return dialog;
}

/**
 * 三个行级弹窗的面板侧守卫用例参数化：会话代次与 accountId 双重核对的代码路径同构，
 * 但每个弹窗各有一条独立代次，逐个覆盖才能抓住「用错了 key」这类接线错误。
 */
type RowDialogCase = {
  actionName: RegExp;
  /** 该弹窗对应的 adapter 调用次数：用于确认请求已发出，再推进会话时序 */
  adapterCallCount: () => number;
  /** 断言新鲜成功的反馈措辞（不含目标，因为当前弹窗就是提交目标） */
  assertFreshSuccessFeedback: () => void;
  /** 断言陈旧成功的反馈点名了实际提交的目标，不会被误读成当前弹窗的结果 */
  assertStaleSuccessFeedback: () => void;
  /** 新鲜失败后断言「已填内容被保留」，证明失败路径没有顺带清空草稿 */
  assertDraftPreserved: (dialog: HTMLElement) => void;
  dialogTitleOf: (nickname: string) => string;
  name: string;
  okButtonName: RegExp;
  prepareSubmit: (dialog: HTMLElement) => void;
  /** 让 adapter 停在 in-flight，返回稍后 resolve 成功的把手 */
  stubPendingSuccess: () => { resolve: () => Promise<void> };
  stubResolvedFailure: (failureMessage: string) => void;
  stubResolvedSuccess: () => void;
};

const ROW_DIALOG_CASES: RowDialogCase[] = [
  {
    actionName: /编\s*辑\s*资\s*料/,
    adapterCallCount: () => updateProfileMock.mock.calls.length,
    assertDraftPreserved: (dialog) => {
      expect(within(dialog).getByLabelText('昵称')).toHaveValue('面板改的昵称');
    },
    assertFreshSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith('资料已更新。');
    },
    assertStaleSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith('「用户A」的资料已更新。');
      expect(message.success).not.toHaveBeenCalledWith('资料已更新。');
    },
    dialogTitleOf: (nickname) => `编辑资料：${nickname}`,
    name: '资料编辑',
    okButtonName: /保\s*存/,
    prepareSubmit: (dialog) => {
      // 差异提交要求至少改动一项，否则走弹窗内的同步校验而不发请求
      fireEvent.change(within(dialog).getByLabelText('昵称'), {
        target: { value: '面板改的昵称' },
      });
    },
    stubPendingSuccess: () => {
      const pending = deferred<AdminUserCommandResult>();
      updateProfileMock.mockReturnValue(pending.promise);

      return {
        resolve: async () => {
          await act(async () => {
            pending.resolve({ ok: true });
          });
        },
      };
    },
    stubResolvedFailure: (failureMessage) => {
      updateProfileMock.mockResolvedValue({
        ok: false,
        reason: 'forbidden',
        message: failureMessage,
      });
    },
    stubResolvedSuccess: () => {
      updateProfileMock.mockResolvedValue({ ok: true });
    },
  },
  {
    actionName: /启\s*停/,
    adapterCallCount: () => setStatusMock.mock.calls.length,
    assertDraftPreserved: (dialog) => {
      expect(within(dialog).getByRole('radio', { name: '停用' })).toBeChecked();
    },
    assertFreshSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith('状态已修改。');
    },
    assertStaleSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith('「用户A」的状态已修改。');
      expect(message.success).not.toHaveBeenCalledWith('状态已修改。');
    },
    dialogTitleOf: (nickname) => `启用 / 停用：${nickname}`,
    name: '启停',
    okButtonName: /^确\s*认$/,
    prepareSubmit: (dialog) => {
      fireEvent.click(within(dialog).getByRole('radio', { name: '停用' }));
    },
    stubPendingSuccess: () => {
      const pending = deferred<AdminUserCommandResult>();
      setStatusMock.mockReturnValue(pending.promise);

      return {
        resolve: async () => {
          await act(async () => {
            pending.resolve({ ok: true });
          });
        },
      };
    },
    stubResolvedFailure: (failureMessage) => {
      setStatusMock.mockResolvedValue({
        ok: false,
        reason: 'status-conflict',
        message: failureMessage,
      });
    },
    stubResolvedSuccess: () => {
      setStatusMock.mockResolvedValue({ ok: true });
    },
  },
  {
    actionName: /重\s*置\s*密\s*码/,
    adapterCallCount: () => resetPasswordMock.mock.calls.length,
    assertDraftPreserved: (dialog) => {
      // 密码字段只断言仍持有输入，不回显、不进入任何成功反馈
      expect(within(dialog).getByLabelText('新密码')).toHaveValue('Valid-reset9!');
    },
    assertFreshSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith(RESET_NOTICE, 6);
    },
    // 后端固定安全提示本身不含目标身份，陈旧成功也逐字沿用，因此与新鲜成功同一句；
    // 关键在于它绝不描述当前弹窗目标，也就不会误导
    assertStaleSuccessFeedback: () => {
      expect(message.success).toHaveBeenCalledWith(RESET_NOTICE, 6);
      expect(message.success).toHaveBeenCalledTimes(1);
    },
    dialogTitleOf: (nickname) => `重置密码：${nickname}`,
    name: '密码重置',
    okButtonName: /重\s*置\s*密\s*码/,
    prepareSubmit: (dialog) => {
      fireEvent.change(within(dialog).getByLabelText('新密码'), {
        target: { value: 'Valid-reset9!' },
      });
      fireEvent.change(within(dialog).getByLabelText('确认新密码'), {
        target: { value: 'Valid-reset9!' },
      });
    },
    stubPendingSuccess: () => {
      const pending = deferred<AdminUserPasswordResetResult>();
      resetPasswordMock.mockReturnValue(pending.promise);

      return {
        resolve: async () => {
          await act(async () => {
            pending.resolve({ ok: true, notice: RESET_NOTICE });
          });
        },
      };
    },
    stubResolvedFailure: (failureMessage) => {
      resetPasswordMock.mockResolvedValue({
        ok: false,
        reason: 'reset-failed',
        message: failureMessage,
      });
    },
    stubResolvedSuccess: () => {
      resetPasswordMock.mockResolvedValue({ ok: true, notice: RESET_NOTICE });
    },
  },
];

describe('管理员用户管理面板的弹窗会话代次守卫', () => {
  beforeEach(() => {
    // message 是 antd 模块级单例，spyOn 跨用例复用同一 mock，需清空历史避免串扰
    vi.spyOn(message, 'success')
      .mockImplementation(() => undefined as never)
      .mockClear();
    fetchUsersMock.mockReset();
    fetchUsersMock.mockResolvedValue(makePage());
    createMock.mockReset();
    updateProfileMock.mockReset();
    setStatusMock.mockReset();
    resetPasswordMock.mockReset();
  });

  it.each(ROW_DIALOG_CASES)(
    '$name：提交进行中把目标从 A 切到 B，A 的成功晚到不关闭 B，且反馈点名实际提交的 A',
    async (testCase) => {
      // 「旧请求在 B 的 commit / layout effect 之前完成」这个窗口对外层不成立：
      // 面板先同步 advance（改 ref）再 setRow，代次早于 React 渲染 B 就已生效。
      // 完整论证见文件头；同步性本身由 use-dialog-session-seq.spec.ts 直测，不靠时序假设。
      const pending = testCase.stubPendingSuccess();
      await renderPanel();

      clickRowAction(ROW_A.nickname, testCase.actionName);
      const dialogOfA = getDialog(testCase.dialogTitleOf(ROW_A.nickname));
      testCase.prepareSubmit(dialogOfA);
      clickDialogButton(dialogOfA, testCase.okButtonName);
      await waitFor(() => expect(testCase.adapterCallCount()).toBe(1));

      clickRowAction(ROW_B.nickname, testCase.actionName);
      expect(isDialogOpen(testCase.dialogTitleOf(ROW_B.nickname))).toBe(true);
      expect(queryDialog(testCase.dialogTitleOf(ROW_A.nickname))).toBeNull();

      await pending.resolve();

      // A 的成功不得关掉 B：B 的弹窗仍在，标题也仍是 B
      expect(isDialogOpen(testCase.dialogTitleOf(ROW_B.nickname))).toBe(true);
      testCase.assertStaleSuccessFeedback();
      // 数据库变更确实发生，reload 照常执行
      await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    },
  );

  it.each(ROW_DIALOG_CASES)(
    '$name：提交进行中把目标切到 B 再切回 A，A 的旧成功不关闭新一代 A 弹窗',
    async (testCase) => {
      // 这一条才真正隔离会话代次：切走再切回后 accountId 完全相同，
      // 只核对 accountId 的实现一定会把新一代 A 弹窗关掉
      const pending = testCase.stubPendingSuccess();
      await renderPanel();

      clickRowAction(ROW_A.nickname, testCase.actionName);
      const staleDialog = getDialog(testCase.dialogTitleOf(ROW_A.nickname));
      testCase.prepareSubmit(staleDialog);
      clickDialogButton(staleDialog, testCase.okButtonName);
      await waitFor(() => expect(testCase.adapterCallCount()).toBe(1));

      clickRowAction(ROW_B.nickname, testCase.actionName);
      clickRowAction(ROW_A.nickname, testCase.actionName);
      expect(isDialogOpen(testCase.dialogTitleOf(ROW_A.nickname))).toBe(true);

      await pending.resolve();

      expect(isDialogOpen(testCase.dialogTitleOf(ROW_A.nickname))).toBe(true);
      testCase.assertStaleSuccessFeedback();
    },
  );

  it.each(ROW_DIALOG_CASES)('$name：正常成功关闭弹窗、给出成功反馈并刷新列表', async (testCase) => {
    testCase.stubResolvedSuccess();
    await renderPanel();

    clickRowAction(ROW_A.nickname, testCase.actionName);
    const dialog = getDialog(testCase.dialogTitleOf(ROW_A.nickname));
    testCase.prepareSubmit(dialog);
    clickDialogButton(dialog, testCase.okButtonName);

    await waitFor(() => expect(testCase.adapterCallCount()).toBe(1));
    await waitFor(() => expect(isDialogOpen(testCase.dialogTitleOf(ROW_A.nickname))).toBe(false));
    testCase.assertFreshSuccessFeedback();
    await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it.each(ROW_DIALOG_CASES)(
    '$name：正常失败在当前弹窗显示后端业务错误原文、保留已填内容且不刷新列表',
    async (testCase) => {
      // 面板此前把 kind === 'ok' 且 result.ok === false 的业务失败塌缩成空 message，
      // 弹窗因此什么都不显示；这里逐个钉住业务失败必须带原文回到弹窗
      testCase.stubResolvedFailure(BUSINESS_FAILURE_MESSAGE);
      await renderPanel();

      clickRowAction(ROW_A.nickname, testCase.actionName);
      const dialog = getDialog(testCase.dialogTitleOf(ROW_A.nickname));
      testCase.prepareSubmit(dialog);
      clickDialogButton(dialog, testCase.okButtonName);

      expect(await within(dialog).findByText(BUSINESS_FAILURE_MESSAGE)).toBeTruthy();
      // 失败不关闭弹窗，关闭只由用户或成功收尾触发
      expect(isDialogOpen(testCase.dialogTitleOf(ROW_A.nickname))).toBe(true);
      testCase.assertDraftPreserved(dialog);
      expect(message.success).not.toHaveBeenCalled();
      // 业务失败不刷新列表，避免把用户正在编辑的 baseline 悄悄换掉
      expect(fetchUsersMock).toHaveBeenCalledTimes(1);
    },
  );

  it('资料编辑：提交进行中把目标切到 B，A 的失败晚到不污染 B 的错误区', async () => {
    const pending = deferred<AdminUserCommandResult>();
    updateProfileMock.mockReturnValue(pending.promise);
    await renderPanel();

    clickRowAction(ROW_A.nickname, /编\s*辑\s*资\s*料/);
    const dialogOfA = getDialog('编辑资料：用户A');
    fireEvent.change(within(dialogOfA).getByLabelText('昵称'), {
      target: { value: '面板改的昵称' },
    });
    clickDialogButton(dialogOfA, /保\s*存/);
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));

    clickRowAction(ROW_B.nickname, /编\s*辑\s*资\s*料/);
    const dialogOfB = getDialog('编辑资料：用户B');

    await act(async () => {
      pending.resolve({ ok: false, reason: 'forbidden', message: STALE_FAILURE_MESSAGE });
    });

    expect(screen.queryByText(STALE_FAILURE_MESSAGE)).toBeNull();
    expect(dialogOfB.textContent).not.toContain(STALE_FAILURE_MESSAGE);
    // B 的弹窗既没被旧结果关掉，也没被写进旧错误
    expect(isDialogOpen('编辑资料：用户B')).toBe(true);
    expect(message.success).not.toHaveBeenCalled();
  });

  it('资料编辑：切走再切回 A，A 的旧失败不显示在新一代 A 弹窗', async () => {
    const pending = deferred<AdminUserCommandResult>();
    updateProfileMock.mockReturnValue(pending.promise);
    await renderPanel();

    clickRowAction(ROW_A.nickname, /编\s*辑\s*资\s*料/);
    const staleDialog = getDialog('编辑资料：用户A');
    fireEvent.change(within(staleDialog).getByLabelText('昵称'), {
      target: { value: '面板改的昵称' },
    });
    clickDialogButton(staleDialog, /保\s*存/);
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledTimes(1));

    // 切走再切回：accountId 完全相同，只有会话代次能区分这是新一代 A 弹窗
    clickRowAction(ROW_B.nickname, /编\s*辑\s*资\s*料/);
    clickRowAction(ROW_A.nickname, /编\s*辑\s*资\s*料/);
    const reopenedDialog = getDialog('编辑资料：用户A');

    await act(async () => {
      pending.resolve({ ok: false, reason: 'forbidden', message: STALE_FAILURE_MESSAGE });
    });

    // 旧失败既不得凭空出现在新一代弹窗，也不得关掉它
    expect(screen.queryByText(STALE_FAILURE_MESSAGE)).toBeNull();
    expect(reopenedDialog.textContent).not.toContain(STALE_FAILURE_MESSAGE);
    expect(isDialogOpen('编辑资料：用户A')).toBe(true);
    expect(message.success).not.toHaveBeenCalled();
    // 失败不触发 reload，也不重放请求
    expect(fetchUsersMock).toHaveBeenCalledTimes(1);
    expect(updateProfileMock).toHaveBeenCalledTimes(1);
  });

  it('创建用户：正常成功关闭弹窗、给出成功反馈并刷新列表', async () => {
    createMock.mockResolvedValue({ ok: true });
    await renderPanel();

    const dialog = await openCreateDialogAndFill({
      loginName: 'mock_create_a',
      nickname: '新建用户甲',
    });
    clickDialogButton(dialog, /创\s*建/);

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: '新建用户甲', role: 'CUSTOMER' }),
      ),
    );
    await waitFor(() => expect(isDialogOpen(CREATE_DIALOG_TITLE)).toBe(false));
    expect(message.success).toHaveBeenCalledWith('用户已创建。');
    await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('创建用户：正常失败在当前弹窗显示后端业务错误原文并保留草稿', async () => {
    createMock.mockResolvedValue({
      ok: false,
      reason: 'duplicate-credential',
      message: BUSINESS_FAILURE_MESSAGE,
    });
    await renderPanel();

    const dialog = await openCreateDialogAndFill({
      loginName: 'mock_create_a',
      nickname: '新建用户甲',
    });
    clickDialogButton(dialog, /创\s*建/);

    expect(await within(dialog).findByText(BUSINESS_FAILURE_MESSAGE)).toBeTruthy();
    expect(isDialogOpen(CREATE_DIALOG_TITLE)).toBe(true);
    expect(within(dialog).getByLabelText('昵称')).toHaveValue('新建用户甲');
    expect(message.success).not.toHaveBeenCalled();
    expect(fetchUsersMock).toHaveBeenCalledTimes(1);
  });

  it('创建用户：提交进行中重入创建入口不推进会话代次，成功续体仍能正常收尾', async () => {
    // 创建弹窗没有 accountId，`open` 就是它的会话身份；重入时 open 不变 ⇒ 弹窗侧不推进，
    // 面板必须给出同一个答案。否则两层判定相反：成功反馈照发、弹窗却不关闭，
    // 已创建成功的草稿凭空留在表单里让用户再提一次
    const pending = deferred<AdminUserCommandResult>();
    createMock.mockReturnValue(pending.promise);
    await renderPanel();

    const dialog = await openCreateDialogAndFill({
      loginName: 'mock_create_a',
      nickname: '新建用户甲',
    });
    clickDialogButton(dialog, /创\s*建/);
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /创\s*建\s*用\s*户/ }));
    expect(isDialogOpen(CREATE_DIALOG_TITLE)).toBe(true);

    await act(async () => {
      pending.resolve({ ok: true });
    });

    // 会话未被推进 ⇒ 这是新鲜成功：关闭弹窗、通用措辞、刷新列表
    expect(message.success).toHaveBeenCalledWith('用户已创建。');
    expect(message.success).not.toHaveBeenCalledWith('「新建用户甲」已创建。');
    await waitFor(() => expect(isDialogOpen(CREATE_DIALOG_TITLE)).toBe(false));
    await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
