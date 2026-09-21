// src/features/account-settings/ui/account-settings-panel.spec.tsx
// @vitest-environment jsdom

/**
 * 账号设置面板组合层单测。
 *
 * 只 mock application Hook，走真实三个区块 UI：验证加载 / 失败 / 就绪三态、
 * 角色与状态只读展示（无编辑控件）、最近变更时间、in-flight 键到按钮 loading 的接线，
 * 以及修改密码成功后把会话收口回调透传给安全设置区块。
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AccountSettingsProfileUpdateResult,
  AccountSettingsView,
  ChangeMyPasswordResult,
} from '../application/account-settings.types';
import type {
  AccountSettingsCommandExecution,
  AccountSettingsState,
} from '../application/use-account-settings';
import * as useAccountSettingsModule from '../application/use-account-settings';

import { AccountSettingsPanel } from './account-settings-panel';

vi.mock('../application/use-account-settings', async (importOriginal) => {
  const actual = await importOriginal<typeof useAccountSettingsModule>();

  return { ...actual, useAccountSettings: vi.fn() };
});

const useAccountSettingsMock = vi.mocked(useAccountSettingsModule.useAccountSettings);

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

type HookValue = ReturnType<typeof useAccountSettingsModule.useAccountSettings>;

function mockHook(overrides: Partial<HookValue> & { state: AccountSettingsState }) {
  useAccountSettingsMock.mockReturnValue({
    isPending: () => false,
    reload: () => {},
    updatePassword: async (): Promise<AccountSettingsCommandExecution<ChangeMyPasswordResult>> => ({
      kind: 'in-flight',
    }),
    updateProfile: async (): Promise<
      AccountSettingsCommandExecution<AccountSettingsProfileUpdateResult>
    > => ({ kind: 'in-flight' }),
    ...overrides,
  });
}

beforeEach(() => {
  useAccountSettingsMock.mockReset();
  vi.spyOn(message, 'success')
    .mockImplementation(() => undefined as never)
    .mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AccountSettingsPanel 加载与失败态', () => {
  it('loading 状态只展示加载态，不渲染任何表单', () => {
    mockHook({ state: { status: 'loading' } });
    render(<AccountSettingsPanel />);

    expect(screen.getByText('账号设置加载中…')).toBeInTheDocument();
    expect(screen.queryByLabelText('昵称')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('failed 状态展示失败标题与收敛文案，点击重试触发 reload', () => {
    const reload = vi.fn();
    mockHook({ reload, state: { message: '账号设置加载失败，请稍后重试。', status: 'failed' } });
    render(<AccountSettingsPanel />);

    expect(screen.getByText('账号设置加载失败')).toBeInTheDocument();
    expect(screen.getByText('账号设置加载失败，请稍后重试。')).toBeInTheDocument();
    expect(screen.queryByLabelText('昵称')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('AccountSettingsPanel 只读事实展示', () => {
  it('展示三个区块标题、角色与状态中文标签以及最近变更时间', () => {
    mockHook({ state: { settings: SETTINGS, status: 'ready' } });
    render(<AccountSettingsPanel />);

    expect(screen.getByText('账号信息')).toBeInTheDocument();
    expect(screen.getByText('基础资料')).toBeInTheDocument();
    expect(screen.getByText('安全设置')).toBeInTheDocument();
    expect(screen.getByText('角色')).toBeInTheDocument();
    expect(screen.getByText('工程师')).toBeInTheDocument();
    expect(screen.getByText('状态')).toBeInTheDocument();
    expect(screen.getByText('正常')).toBeInTheDocument();
    expect(screen.getByText(/^最近变更：\d/)).toBeInTheDocument();
    expect(screen.queryByText('2026-01-01T08:00:00.000Z')).not.toBeInTheDocument();
  });

  it('最近变更时间无法解析时展示占位符，不回显原始值', () => {
    mockHook({
      state: { settings: { ...SETTINGS, updatedAt: 'not-a-date' }, status: 'ready' },
    });
    render(<AccountSettingsPanel />);

    expect(screen.getByText('最近变更：—')).toBeInTheDocument();
    expect(screen.queryByText('not-a-date')).not.toBeInTheDocument();
  });

  it('角色与状态只读：面板中不存在任何指向它们的编辑控件', () => {
    mockHook({ state: { settings: SETTINGS, status: 'ready' } });
    render(<AccountSettingsPanel />);

    const editableLabels = [
      '登录名',
      '登录邮箱（登录凭据）',
      '昵称',
      '公司名称',
      '电话',
      '联系邮箱（非登录凭据）',
      '当前密码',
      '新密码',
      '确认新密码',
    ];

    for (const label of editableLabels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }

    expect(screen.queryByLabelText(/角色/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const buttonNames = screen.queryAllByRole('button').map((button) => button.textContent ?? '');

    expect(buttonNames.some((name) => /角色|状态/.test(name))).toBe(false);
  });

  it('不展示 accountId 等身份字段，视图事实只来自后端返回的九项', () => {
    mockHook({ state: { settings: SETTINGS, status: 'ready' } });
    const { container } = render(<AccountSettingsPanel />);
    const text = container.textContent ?? '';

    expect(text).not.toContain('accountId');
    expect(text).not.toContain('accessGroup');
    expect(text).not.toContain('metaDigest');
    expect(text).not.toContain('identityHint');
    expect(text).not.toContain('userState');
  });
});

describe('AccountSettingsPanel 命令接线', () => {
  it('update-profile 进行中时两个资料区块的保存按钮同时进入 loading', () => {
    mockHook({
      isPending: (key) => key === 'update-profile',
      state: { settings: SETTINGS, status: 'ready' },
    });
    render(<AccountSettingsPanel />);

    const saveButtons = screen.getAllByRole('button', { name: /保\s*存/ });

    expect(saveButtons).toHaveLength(2);
    for (const button of saveButtons) {
      expect(button).toHaveClass('ant-btn-loading');
    }
    expect(screen.getByRole('button', { name: /修\s*改\s*密\s*码/ })).not.toHaveClass(
      'ant-btn-loading',
    );
  });

  it('change-password 进行中时只有安全设置区块进入 loading，并禁用重置', () => {
    mockHook({
      isPending: (key) => key === 'change-password',
      state: { settings: SETTINGS, status: 'ready' },
    });
    render(<AccountSettingsPanel />);

    expect(screen.getByRole('button', { name: /修\s*改\s*密\s*码/ })).toHaveClass(
      'ant-btn-loading',
    );
    expect(screen.getByRole('button', { name: /重\s*置/ })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /保\s*存/ })) {
      expect(button).not.toHaveClass('ant-btn-loading');
    }
  });

  it('修改密码成功后把发起时采样的会话身份交给页面装配层的会话收口回调', async () => {
    const onPasswordChangeSucceeded = vi.fn();
    mockHook({
      state: { settings: SETTINGS, status: 'ready' },
      updatePassword: async () => ({
        kind: 'ok',
        result: {
          initiatedIdentity: { accountId: 900201, epoch: 1 },
          notice: '密码已更新，请使用新密码重新登录',
          ok: true,
        },
      }),
    });
    render(<AccountSettingsPanel onPasswordChangeSucceeded={onPasswordChangeSucceeded} />);

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'Old#Pass2026' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'Str0ng#Pass2026' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), {
      target: { value: 'Str0ng#Pass2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /修\s*改\s*密\s*码/ }));

    await waitFor(() => expect(onPasswordChangeSucceeded).toHaveBeenCalledTimes(1));
    // 迟到响应裁决依据：成功结果携带的发起时会话身份原样透传给装配层
    expect(onPasswordChangeSucceeded).toHaveBeenCalledWith({ accountId: 900201, epoch: 1 });
  });

  it('资料更新成功不触发会话收口回调（只有改密会使既有会话失效）', async () => {
    const onPasswordChangeSucceeded = vi.fn();
    mockHook({
      state: { settings: SETTINGS, status: 'ready' },
      updateProfile: async () => ({
        kind: 'ok',
        result: { isUpdated: true, ok: true, settings: { ...SETTINGS, nickname: '新昵称' } },
      }),
    });
    render(<AccountSettingsPanel onPasswordChangeSucceeded={onPasswordChangeSucceeded} />);

    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: '新昵称' } });
    const saveButtons = screen.getAllByRole('button', { name: /保\s*存/ });

    fireEvent.click(saveButtons[1] as HTMLElement);

    await waitFor(() => expect(message.success).toHaveBeenCalledWith('基础资料已保存。'));
    expect(onPasswordChangeSucceeded).not.toHaveBeenCalled();
  });
});
