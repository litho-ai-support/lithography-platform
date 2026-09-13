// src/features/admin-user-management/ui/admin-user-management-panel-create-session.spec.tsx
// @vitest-environment jsdom

/**
 * 面板侧「创建弹窗」会话代次接线的直测（双层守卫的外层，create 这一条）。
 *
 * 为什么单独一个文件：本 spec 用 `vi.mock` 把 `AdminUserCreateModal` 换成受控替身，
 * 而 `vi.mock` 是文件级的；`admin-user-management-panel.spec.tsx` 里的用例要依赖真实弹窗
 * 填表单、走 antd 校验，两者无法共存于同一个文件。
 *
 * 为什么需要替身——这不是在伪造用户可达性结论：面板把 `submitting` 接到
 * `commands.isPending('create')`，真实弹窗再把它接到 `confirmLoading`，于是 antd 6.4.3 的
 * `Modal.handleCancel` 在提交期间直接 `return`，取消按钮 / X / 遮罩 / Esc 四条关闭路径全被吞掉。
 * 「提交期间关闭创建弹窗」在当前接线下**不是**用户可复现的操作序列，本 spec 不宣称它可达，
 * 也没有改 antd 配置或任何生产行为。它验证的是另一件事：`submitting` 只是宿主传入的 prop，
 * 面板自己的创建会话代次接线必须在「宿主允许提交期间关闭」时依然正确。
 * 替身刻意不实现任何代次守卫，所以下面观察到的保护只能来自面板层。
 *
 * 替身对 `destroyOnHidden` 的建模：`open` 为 false 时整个弹窗子树不渲染，草稿随子树卸载消失
 * （非受控 input 重新挂载后为空）。这与真实弹窗「关闭即销毁 Form」一致，于是
 * 「旧成功把新一代弹窗关掉」会直接表现为「新草稿被清空」，成为可断言的信号。
 *
 * 时序全部由可控 deferred 推进：不使用 sleep，不扩大 timeout。
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminUserCommandResult,
  AdminUserCreateDraft,
  AdminUserListPage,
  AdminUserRow,
} from '../application/admin-user-management.types';
import * as adminUserAdapter from '../infrastructure/admin-user-adapter';

import { AdminUserManagementPanel } from './admin-user-management-panel';

vi.mock('../infrastructure/admin-user-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof adminUserAdapter>();

  return {
    ...actual,
    adminCreateUser: vi.fn(),
    fetchAdminUsers: vi.fn(),
  };
});

vi.mock('./admin-user-create-modal', () => {
  // 草稿模板与替身组件都定义在工厂内部：`vi.mock` 会被提升到所有 import 之前，
  // 引用本文件后面声明的绑定会撞上 TDZ。类型注解在编译期擦除，不受此限制。
  const draftTemplate: AdminUserCreateDraft = {
    companyName: '草稿公司',
    contactEmail: 'draft-contact@example.com',
    initialPassword: 'Valid-create9!',
    loginEmail: 'draft@example.com',
    loginName: 'mock_create_draft',
    nickname: '',
    phone: '13800000009',
    role: 'CUSTOMER',
  };

  type CreateModalDoubleProps = {
    onCancel: () => void;
    onSubmit: (draft: AdminUserCreateDraft) => Promise<AdminUserCommandResult>;
    open: boolean;
    submitting: boolean;
  };

  function OpenCreateDialog({
    onCancel,
    onSubmit,
    submitting,
  }: Omit<CreateModalDoubleProps, 'open'>) {
    return (
      <div className="ant-modal" role="dialog">
        <div className="ant-modal-title">创建用户</div>
        {/* 替身不复制 antd 的 confirmLoading 关闭门禁，但把 submitting 渲染出来，
            好让用例能钉住「关闭动作发生时请求确实在途」 */}
        <span>{`提交中：${String(submitting)}`}</span>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nickname = String(new FormData(event.currentTarget).get('nickname') ?? '');

            void onSubmit({ ...draftTemplate, nickname });
          }}
        >
          <label>
            草稿昵称
            <input defaultValue="" name="nickname" />
          </label>
          <button type="submit">提交草稿</button>
        </form>
        <button onClick={onCancel} type="button">
          关闭弹窗
        </button>
      </div>
    );
  }

  function AdminUserCreateModalDouble({
    onCancel,
    onSubmit,
    open,
    submitting,
  }: CreateModalDoubleProps) {
    // open 翻转为 false 时卸载整个子树，等价于真实弹窗的 destroyOnHidden
    return open ? (
      <OpenCreateDialog onCancel={onCancel} onSubmit={onSubmit} submitting={submitting} />
    ) : null;
  }

  return { AdminUserCreateModal: AdminUserCreateModalDouble };
});

const fetchUsersMock = vi.mocked(adminUserAdapter.fetchAdminUsers);
const createMock = vi.mocked(adminUserAdapter.adminCreateUser);

const CREATE_DIALOG_TITLE = '创建用户';
const CREATE_TOOLBAR_BUTTON = /创\s*建\s*用\s*户/;
const FIRST_DRAFT_NICKNAME = '新建用户甲';
const SECOND_DRAFT_NICKNAME = '新建用户乙';

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

function makePage(): AdminUserListPage {
  return { items: [ROW_A], page: 1, pageSize: 10, total: 1 };
}

/** 可控 deferred：用显式 resolve 推进时序，不依赖 sleep 也不扩大 timeout */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

/**
 * 按标题文本反查替身弹窗容器。
 *
 * 沿用面板 spec 的做法（限定 `.ant-modal-title` 再上溯 `[role="dialog"]`）：测试环境下
 * `@rc-component/util` 的 `useId` 恒返回 `'test-id'`，工具条 Select 会与 rc-dialog 标题撞 id，
 * 弹窗的 accessible name 不可靠。
 */
function queryCreateDialog(): HTMLElement | null {
  const titleNode = screen.queryByText(CREATE_DIALOG_TITLE, { selector: '.ant-modal-title' });

  return (titleNode?.closest('[role="dialog"]') as HTMLElement | null) ?? null;
}

function getCreateDialog(): HTMLElement {
  const dialog = queryCreateDialog();

  if (dialog === null) {
    throw new Error('创建弹窗替身未渲染');
  }

  return dialog;
}

async function renderPanel() {
  render(<AdminUserManagementPanel />);

  await screen.findByText(ROW_A.nickname);
}

function openCreateDialog(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: CREATE_TOOLBAR_BUTTON }));

  return getCreateDialog();
}

function fillDraft(dialog: HTMLElement, nickname: string) {
  fireEvent.change(within(dialog).getByLabelText('草稿昵称'), { target: { value: nickname } });
}

function submitDraft(dialog: HTMLElement) {
  const form = dialog.querySelector('form');

  if (form === null) {
    throw new Error('创建弹窗替身里没有表单');
  }

  fireEvent.submit(form);
}

function closeCreateDialog(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭弹窗' }));
}

/**
 * 布置出「第一代创建请求仍在途 + 弹窗已关闭并重开为第二代」的状态。
 *
 * 面板对 create 的会话代次实际计数：首次打开推进到 1（第一代提交捕获的快照），
 * 关闭推进到 2，重开再推进到 3。也就是说「第一代 / 第二代」对应的是快照 1 与 3，
 * 中间那次推进来自关闭本身——正是它让第一代的成功续体过期。
 */
async function arrangeReopenedCreateDialog() {
  const pending = deferred<AdminUserCommandResult>();
  createMock.mockReturnValue(pending.promise);
  await renderPanel();

  const firstDialog = openCreateDialog();
  fillDraft(firstDialog, FIRST_DRAFT_NICKNAME);
  submitDraft(firstDialog);
  await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
  expect(createMock).toHaveBeenCalledWith(
    expect.objectContaining({ nickname: FIRST_DRAFT_NICKNAME }),
  );
  // 钉住关闭动作发生时请求确实在途：面板传给弹窗的 submitting 已翻真
  expect(within(firstDialog).getByText('提交中：true')).toBeTruthy();

  closeCreateDialog(firstDialog);
  expect(queryCreateDialog()).toBeNull();

  const secondDialog = openCreateDialog();
  fillDraft(secondDialog, SECOND_DRAFT_NICKNAME);
  expect(within(secondDialog).getByLabelText('草稿昵称')).toHaveValue(SECOND_DRAFT_NICKNAME);

  return pending;
}

describe('管理员用户管理面板的创建弹窗会话代次接线', () => {
  beforeEach(() => {
    // message 是 antd 模块级单例，spyOn 跨用例复用同一 mock，需清空历史避免串扰
    vi.spyOn(message, 'success')
      .mockImplementation(() => undefined as never)
      .mockClear();
    fetchUsersMock.mockReset();
    fetchUsersMock.mockResolvedValue(makePage());
    createMock.mockReset();
  });

  it('创建弹窗：提交期间关闭并重开，旧请求的成功晚到不关闭新一代弹窗、不清空新草稿', async () => {
    const pending = await arrangeReopenedCreateDialog();

    // 第一代请求此刻才成功返回
    await act(async () => {
      pending.resolve({ ok: true });
    });

    // 陈旧成功不得关闭新一代弹窗。替身在关闭时会卸载草稿子树，
    // 所以「弹窗仍在」与「草稿仍是第二代的值」是同一条不变量的两个可观察面
    expect(queryCreateDialog()).not.toBeNull();
    const reopenedDialog = getCreateDialog();
    expect(within(reopenedDialog).getByLabelText('草稿昵称')).toHaveValue(SECOND_DRAFT_NICKNAME);

    // 真实写入确实发生：反馈必须点名实际提交的第一代草稿，
    // 既不能用会被读成「当前这次成功」的通用措辞，也不能误称第二代草稿已创建
    expect(message.success).toHaveBeenCalledWith(`「${FIRST_DRAFT_NICKNAME}」已创建。`);
    expect(message.success).not.toHaveBeenCalledWith('用户已创建。');
    expect(message.success).not.toHaveBeenCalledWith(`「${SECOND_DRAFT_NICKNAME}」已创建。`);

    // reload 照常执行，但不重放创建请求
    await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('创建弹窗：旧请求成功晚到之后，新一代提交仍属新鲜会话，正常关闭并给出通用措辞', async () => {
    const pending = await arrangeReopenedCreateDialog();

    await act(async () => {
      pending.resolve({ ok: true });
    });
    expect(queryCreateDialog()).not.toBeNull();

    // 陈旧收尾只判定、不推进代次，所以第二代会话的快照仍然有效：
    // 面板必须给出与第一代会话一致的判定，否则守卫等于把创建弹窗永久关不掉
    createMock.mockResolvedValue({ ok: true });
    submitDraft(getCreateDialog());

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ nickname: SECOND_DRAFT_NICKNAME }),
    );
    await waitFor(() => expect(queryCreateDialog()).toBeNull());
    expect(message.success).toHaveBeenCalledWith('用户已创建。');
    await waitFor(() => expect(fetchUsersMock.mock.calls.length).toBeGreaterThanOrEqual(3));
  });
});
