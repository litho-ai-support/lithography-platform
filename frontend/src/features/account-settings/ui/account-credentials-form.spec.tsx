// src/features/account-settings/ui/account-credentials-form.spec.tsx
// @vitest-environment jsdom

/**
 * 账号信息（登录凭据）表单 UI 单测。
 *
 * 走真实组件与真实 antd 校验规则，onSubmit 由测试注入：
 * 验证登录名格式镜像校验、「两个凭据至少保留一个」拦截、成功 / 未变化两种提示、
 * 业务失败保留表单内容，以及 editVersionRef 陈旧响应守卫（请求期间的输入不被回写覆盖）。
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AccountSettingsProfileUpdateResult,
  AccountSettingsView,
} from '../application/account-settings.types';
import { ACCOUNT_LOGIN_NAME_RULE_MESSAGE } from '../application/account-settings-policy';
import type { AccountSettingsCommandExecution } from '../application/use-account-settings';

import { AccountCredentialsForm } from './account-credentials-form';

const SETTINGS: AccountSettingsView = {
  companyName: '示例公司',
  contactEmail: 'contact@example.com',
  loginEmail: 'self@example.com',
  loginName: 'self_user',
  nickname: '陈工',
  phone: '13800000000',
  role: 'ENGINEER',
  status: 'ACTIVE',
  updatedAt: '2026-01-01T08:00:00.000Z',
};

type SubmitExecution = AccountSettingsCommandExecution<AccountSettingsProfileUpdateResult>;

const LOGIN_NAME_LABEL = '登录名';
const LOGIN_EMAIL_LABEL = '登录邮箱（登录凭据）';
const BOTH_EMPTY_MESSAGE = '登录名与登录邮箱至少需要保留一个';

function getSubmitButton() {
  return screen.getByRole('button', { name: /保\s*存/ });
}

function fillLoginName(value: string) {
  fireEvent.change(screen.getByLabelText(LOGIN_NAME_LABEL), { target: { value } });
}

function fillLoginEmail(value: string) {
  fireEvent.change(screen.getByLabelText(LOGIN_EMAIL_LABEL), { target: { value } });
}

function successResult(
  overrides?: Partial<AccountSettingsView>,
  isUpdated = true,
): SubmitExecution {
  return {
    kind: 'ok',
    result: {
      isUpdated,
      ok: true,
      settings: { ...SETTINGS, ...overrides },
    },
  };
}

function businessFailure(text: string): SubmitExecution {
  return { kind: 'ok', result: { message: text, ok: false, reason: 'duplicate-credential' } };
}

beforeEach(() => {
  vi.spyOn(message, 'success')
    .mockImplementation(() => undefined as never)
    .mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AccountCredentialsForm 客户端校验', () => {
  it.each([['ab'], ['abc'], ['陈工'], ['user name'], ['user@name'], ['a'.repeat(31)]])(
    '登录名 %s 不符合镜像策略时拦截提交并给出可行动提示',
    async (loginName) => {
      const onSubmit = vi.fn();
      render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

      fillLoginName(loginName);
      fireEvent.click(getSubmitButton());

      expect(await screen.findByText(ACCOUNT_LOGIN_NAME_RULE_MESSAGE)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('登录名在 4~30 位且字符集合规时放行', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult({ loginName: 'renamed_user' }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('renamed_user');
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(ACCOUNT_LOGIN_NAME_RULE_MESSAGE)).not.toBeInTheDocument();
  });

  it.each([['not-an-email'], ['  not-an-email  ']])(
    '登录邮箱为 %s 时拦截提交（trim 不会让非法值蒙混过关）',
    async (loginEmail) => {
      const onSubmit = vi.fn();
      render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

      fillLoginEmail(loginEmail);
      fireEvent.click(getSubmitButton());

      expect(await screen.findByText('登录邮箱格式不正确')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('登录邮箱两侧带空白：通过前端校验，显示值不被改写，提交值已 trim', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult({ loginEmail: 'valid@example.com' }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginEmail('  valid@example.com  ');

    // trim 只作用于校验值：刻意不用 Input 的 normalize，用户输入过程中的显示值不被改写
    expect(screen.getByLabelText(LOGIN_EMAIL_LABEL)).toHaveValue('  valid@example.com  ');

    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      loginEmail: 'valid@example.com',
      loginName: 'self_user',
    });
    expect(screen.queryByText('登录邮箱格式不正确')).not.toBeInTheDocument();
  });

  it('登录邮箱为纯空白：通过校验并按既有清空语义提交 null，保留另一个凭据', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult({ loginEmail: null }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginEmail('   ');
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ loginEmail: null, loginName: 'self_user' });
    expect(screen.queryByText('登录邮箱格式不正确')).not.toBeInTheDocument();
    expect(screen.queryByText(BOTH_EMPTY_MESSAGE)).not.toBeInTheDocument();
  });

  it('登录名与登录邮箱同时清空时被拦截，两个字段都给出同一条提示', async () => {
    const onSubmit = vi.fn();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('');
    fillLoginEmail('');
    fireEvent.click(getSubmitButton());

    const messages = await screen.findAllByText(BOTH_EMPTY_MESSAGE);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('只清空登录名、保留登录邮箱时按三态语义提交 null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult({ loginName: null }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('   ');
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      loginEmail: 'self@example.com',
      loginName: null,
    });
    expect(screen.queryByText(BOTH_EMPTY_MESSAGE)).not.toBeInTheDocument();
  });
});

describe('AccountCredentialsForm 提交结果处理', () => {
  it('保存成功时提交 trim 后的三态草稿并提示「已保存」', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult({ loginName: 'renamed_user' }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('  renamed_user  ');
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      loginEmail: 'self@example.com',
      loginName: 'renamed_user',
    });
    await waitFor(() => expect(message.success).toHaveBeenCalledWith('登录凭据已保存。'));
  });

  it('后端判定同值（isUpdated=false）时提示「未发生变化」，与保存成功文案区分', async () => {
    const onSubmit = vi.fn().mockResolvedValue(successResult(undefined, false));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(message.success).toHaveBeenCalledWith('登录凭据未发生变化。'));
    expect(message.success).not.toHaveBeenCalledWith('登录凭据已保存。');
  });

  it('凭据冲突时展示后端业务文案，并保留用户已填写的表单内容', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue(businessFailure('登录名或登录邮箱已被占用，请更换后重试。'));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('taken_user');
    fillLoginEmail('taken@example.com');
    fireEvent.click(getSubmitButton());

    expect(await screen.findByText('登录名或登录邮箱已被占用，请更换后重试。')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('登录名或登录邮箱已被占用，请更换后重试。');
    expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('taken_user');
    expect(screen.getByLabelText(LOGIN_EMAIL_LABEL)).toHaveValue('taken@example.com');
    expect(message.success).not.toHaveBeenCalled();
  });

  it('业务拒绝后重新提交会清掉上一次的错误提示', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce(businessFailure('登录名或登录邮箱已被占用，请更换后重试。'))
      .mockResolvedValueOnce(successResult({ loginName: 'fresh_user' }));
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('taken_user');
    fireEvent.click(getSubmitButton());
    expect(await screen.findByText('登录名或登录邮箱已被占用，请更换后重试。')).toBeInTheDocument();

    fillLoginName('fresh_user');
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(message.success).toHaveBeenCalledWith('登录凭据已保存。'));
    await waitFor(() =>
      expect(
        screen.queryByText('登录名或登录邮箱已被占用，请更换后重试。'),
      ).not.toBeInTheDocument(),
    );
  });

  it('transport 类失败展示收敛后的兜底文案，不外泄原始错误信息', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ kind: 'unhandled-error', message: '网络连接异常，请稍后重试。' });
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('renamed_user');
    fireEvent.click(getSubmitButton());

    expect(await screen.findByText('网络连接异常，请稍后重试。')).toBeInTheDocument();
    expect(message.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('renamed_user');
  });

  it('提交进行中按钮处于 loading 态，重复点击不再触发 onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting />);

    fireEvent.click(getSubmitButton());
    fireEvent.click(getSubmitButton());

    expect(getSubmitButton()).toHaveClass('ant-btn-loading');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('同类命令进行中被拒（in-flight）时静默忽略，不提示也不清错误', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ kind: 'in-flight' });
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(message.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/** 可控提交：测试自行决定响应何时回来，以复现「请求期间继续输入」的竞态 */
function deferredSubmit() {
  let resolveExecution: (execution: SubmitExecution) => void = () => {};
  const onSubmit = vi.fn().mockImplementation(
    () =>
      new Promise<SubmitExecution>((resolve) => {
        resolveExecution = resolve;
      }),
  );

  return { onSubmit, resolve: (execution: SubmitExecution) => resolveExecution(execution) };
}

describe('AccountCredentialsForm 编辑版本守卫', () => {
  it('请求进行中继续输入时，陈旧响应不回写覆盖用户输入', async () => {
    const { onSubmit, resolve } = deferredSubmit();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('renamed_user');
    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    fillLoginName('renamed_again');
    fillLoginEmail('again@example.com');
    resolve(successResult({ loginEmail: 'self@example.com', loginName: 'renamed_user' }));

    await waitFor(() => expect(message.success).toHaveBeenCalledWith('登录凭据已保存。'));
    expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('renamed_again');
    expect(screen.getByLabelText(LOGIN_EMAIL_LABEL)).toHaveValue('again@example.com');
  });

  it('请求期间没有继续输入时，把后端归一结果回写表单', async () => {
    const { onSubmit, resolve } = deferredSubmit();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fillLoginName('  Renamed_User  ');
    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    resolve(successResult({ loginName: 'Renamed_User' }));

    await waitFor(() =>
      expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('Renamed_User'),
    );
  });

  it('未做任何输入直接保存时，回写后端权威视图（含被清空的凭据）', async () => {
    const { onSubmit, resolve } = deferredSubmit();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    resolve(successResult({ loginEmail: null, loginName: 'self_user' }));

    await waitFor(() => expect(screen.getByLabelText(LOGIN_EMAIL_LABEL)).toHaveValue(''));
    expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('self_user');
  });

  it('回写不推进编辑版本：第二轮请求期间的输入仍能阻止陈旧响应覆盖', async () => {
    const { onSubmit, resolve } = deferredSubmit();
    render(<AccountCredentialsForm onSubmit={onSubmit} settings={SETTINGS} submitting={false} />);

    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    resolve(successResult({ loginName: 'normalized_user' }));
    await waitFor(() =>
      expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('normalized_user'),
    );

    // 提交前的输入属于本次提交值，回写只归一差异；守卫只保护请求期间的输入
    fillLoginName('typing_before_submit');
    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    fillLoginName('typing_during_request');
    resolve(successResult({ loginName: 'stale_value' }));

    await waitFor(() => expect(message.success).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText(LOGIN_NAME_LABEL)).toHaveValue('typing_during_request');
  });
});
