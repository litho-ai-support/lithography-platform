// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AdminUserCreateModal } from './admin-user-create-modal';

const PASSWORD_HINT =
  '密码长度需为 8～128 位，至少包含小写字母、数字和特殊字符，不能使用常见弱密码。';

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
