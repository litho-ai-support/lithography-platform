// src/features/admin-user-management/ui/admin-user-create-modal.spec.tsx
// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  AdminUserCommandResult,
  AdminUserCreateDraft,
} from '../application/admin-user-management.types';

import { AdminUserCreateModal } from './admin-user-create-modal';

const PASSWORD_HINT =
  '密码长度需为 8～128 位，至少包含小写字母、数字和特殊字符，不能使用常见弱密码。';

const STALE_FAILURE_MESSAGE = '上一代会话的重复凭据错误';
const FRESH_FAILURE_MESSAGE = '新一代会话自己的错误';

/** 可控 deferred：用显式 resolve 推进时序，不依赖 sleep 也不扩大 timeout */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function renderCreateModal(overrides: {
  onCancel?: () => void;
  onSubmit: (draft: AdminUserCreateDraft) => Promise<AdminUserCommandResult>;
  open?: boolean;
}) {
  const onCancel = overrides.onCancel ?? vi.fn();

  return {
    onCancel,
    ...render(
      <AdminUserCreateModal
        open={overrides.open ?? true}
        submitting={false}
        onCancel={onCancel}
        onSubmit={overrides.onSubmit}
      />,
    ),
  };
}

async function selectCustomerRole() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByText('客户'));
}

async function fillValidDraft() {
  await selectCustomerRole();
  fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '验证用户' } });
  fireEvent.change(screen.getByLabelText('登录名（登录凭据之一）'), {
    target: { value: 'mock_create_test' },
  });
  fireEvent.change(screen.getByLabelText('登录邮箱（登录凭据之一）'), {
    target: { value: 'mock_create_test@example.com' },
  });
  fireEvent.change(screen.getByLabelText('初始密码'), { target: { value: 'Valid-create9!' } });
  fireEvent.change(screen.getByLabelText('确认初始密码'), {
    target: { value: 'Valid-create9!' },
  });
  fireEvent.change(screen.getByLabelText('公司名称'), { target: { value: '测试公司' } });
  fireEvent.change(screen.getByLabelText('电话'), { target: { value: '13800138000' } });
  fireEvent.change(screen.getByLabelText('联系邮箱（非登录凭据）'), {
    target: { value: 'test-contact@example.com' },
  });
}

describe('AdminUserCreateModal', () => {
  it('展示纯提示性的现有密码策略，不在前端新增复杂度拦截', () => {
    render(
      <AdminUserCreateModal
        open
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );

    expect(screen.getByText(PASSWORD_HINT, { exact: false })).toBeTruthy();
  });

  it('展示 adapter 返回的重复凭据错误并保留填写内容和弹窗', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'duplicate-credential',
      message: '登录名或登录邮箱已被占用，请更换后重试。',
    });

    render(<AdminUserCreateModal open submitting={false} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await fillValidDraft();
    fireEvent.click(screen.getByRole('button', { name: /创 建/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('登录名或登录邮箱已被占用，请更换后重试。')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '创建用户' })).toBeTruthy();
    expect(screen.getByLabelText('登录名（登录凭据之一）')).toHaveValue('mock_create_test');
    expect(screen.getByLabelText('登录邮箱（登录凭据之一）')).toHaveValue(
      'mock_create_test@example.com',
    );
    expect(screen.getByLabelText('初始密码')).toHaveValue('Valid-create9!');
    expect(screen.getByLabelText('公司名称')).toHaveValue('测试公司');
  });

  it('展示 adapter 返回的具体密码策略错误并保留弹窗', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      reason: 'invalid-input',
      message: '初始密码：密码必须包含特殊字符 (!@#$%^&* 等)',
    });

    render(<AdminUserCreateModal open submitting={false} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await fillValidDraft();
    fireEvent.click(screen.getByRole('button', { name: /创 建/ }));

    expect(await screen.findByText('初始密码：密码必须包含特殊字符 (!@#$%^&* 等)')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '创建用户' })).toBeTruthy();
  });
});

/**
 * 提交期间关闭 / 重开的陈旧结果守卫。
 *
 * 弹窗在 panel 里恒定挂载，`destroyOnHidden` 只销毁 Form 子树，不重置弹窗自己的 state，
 * 因此会话在续体回来之前被推进过，旧失败就会在重开后凭空出现。
 * 本 spec 传 `submitting={false}`：`submitting` 是宿主传入的 prop，弹窗自己的正确性不得依赖它。
 * 两条关闭路径分开覆盖：一条走真实 `onCancel`，一条只翻转 `open`，
 * 分别验证同步失效与 render 阶段代次推进。
 */
describe('AdminUserCreateModal 的提交代次守卫', () => {
  it('提交期间点击取消后重开：旧失败不写进弹窗，重开后也不出现陈旧错误', async () => {
    const stale = deferred<AdminUserCommandResult>();
    const onSubmit = vi.fn().mockReturnValue(stale.promise);
    const { onCancel, rerender } = renderCreateModal({ onSubmit });

    await fillValidDraft();
    fireEvent.click(screen.getByRole('button', { name: /创\s*建/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // 宿主传 `submitting={false}`，因此提交期间取消按钮仍然可点（confirmLoading 未置位）
    fireEvent.click(screen.getByRole('button', { name: /取\s*消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <AdminUserCreateModal
        open={false}
        submitting={false}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    rerender(
      <AdminUserCreateModal open submitting={false} onCancel={onCancel} onSubmit={onSubmit} />,
    );

    await act(async () => {
      stale.resolve({
        ok: false,
        reason: 'duplicate-credential',
        message: STALE_FAILURE_MESSAGE,
      });
    });

    expect(screen.queryByText(STALE_FAILURE_MESSAGE)).toBeNull();
    expect(screen.getByRole('dialog', { name: '创建用户' })).toBeTruthy();
  });

  it('提交期间只翻转 open 关闭再重开：旧失败同样不得显示在新一代弹窗', async () => {
    // 刻意不点取消：只靠 `open` 翻转驱动代次推进，验证 render 阶段守卫独立生效
    const stale = deferred<AdminUserCommandResult>();
    const onSubmit = vi.fn().mockReturnValue(stale.promise);
    const { rerender } = renderCreateModal({ onSubmit });

    await fillValidDraft();
    fireEvent.click(screen.getByRole('button', { name: /创\s*建/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    rerender(
      <AdminUserCreateModal
        open={false}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    rerender(
      <AdminUserCreateModal open submitting={false} onCancel={vi.fn()} onSubmit={onSubmit} />,
    );

    await act(async () => {
      stale.resolve({
        ok: false,
        reason: 'duplicate-credential',
        message: STALE_FAILURE_MESSAGE,
      });
    });

    expect(screen.queryByText(STALE_FAILURE_MESSAGE)).toBeNull();
    expect(screen.getByRole('dialog', { name: '创建用户' })).toBeTruthy();

    // 守卫只对陈旧结果失败关闭，不能把弹窗永久弄哑：重开后的新会话仍能正常展示自己的错误
    onSubmit.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-input',
      message: FRESH_FAILURE_MESSAGE,
    });
    fireEvent.click(screen.getByRole('button', { name: /创\s*建/ }));

    expect(await screen.findByText(FRESH_FAILURE_MESSAGE)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(STALE_FAILURE_MESSAGE)).toBeNull();
  });
});
