// src/features/account-settings/infrastructure/account-settings-adapter.spec.ts

/**
 * 账号设置 GraphQL adapter（外部技术边界唯一落点）单测。
 *
 * 只 mock 共享 executeGraphQL，验证：
 * - 三个 operation 的文档与变量口径（含资料更新的三态 input 构造）；
 * - 业务拒绝按稳定的 extensions.code 大类映射为显式失败结果，errorMessage 仅作细化；
 * - 未登记大类码 / 缺少 code / 非 ingress 错误继续上抛，交共享 ingress 链路处理；
 * - 改密结果不含任何密码、哈希或令牌字段。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as sharedGraphql from '@/shared/graphql';
import { GraphQLIngressError } from '@/shared/graphql';

import type { AccountSettingsProfileFailureReason } from '../application/account-settings.types';

import type { MyAccountSettingsDto } from './account-settings.dto';
import {
  changeMyPassword,
  fetchMyAccountSettings,
  updateMyAccountSettingsProfile,
} from './account-settings-adapter';

vi.mock('@/shared/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedGraphql>();

  return { ...actual, executeGraphQL: vi.fn() };
});

const executeGraphQLMock = vi.mocked(sharedGraphql.executeGraphQL);

const SETTINGS_DTO: MyAccountSettingsDto = {
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

/** 与 SETTINGS_DTO 等价的内部视图（已归一，无脏值需要 trim） */
const SETTINGS_VIEW = { ...SETTINGS_DTO };

function buildIngressError(options: {
  code?: string;
  errorCode?: string;
  errorMessage?: string;
  withGraphqlErrors?: boolean;
}) {
  const extensions: Record<string, unknown> = {};

  if (options.code !== undefined) {
    extensions.code = options.code;
  }

  if (options.errorCode !== undefined) {
    extensions.errorCode = options.errorCode;
  }

  if (options.errorMessage !== undefined) {
    extensions.errorMessage = options.errorMessage;
  }

  return new GraphQLIngressError({
    type: 'graphql',
    message: '请求处理失败。',
    graphqlErrors:
      options.withGraphqlErrors === false ? [] : [{ message: '请求处理失败。', extensions }],
  });
}

beforeEach(() => {
  executeGraphQLMock.mockReset();
});

describe('fetchMyAccountSettings', () => {
  it('只发一次受保护 query，并把 DTO 映射为 feature 内部视图', async () => {
    executeGraphQLMock.mockResolvedValue({ myAccountSettings: SETTINGS_DTO });

    await expect(fetchMyAccountSettings()).resolves.toEqual(SETTINGS_VIEW);

    expect(executeGraphQLMock).toHaveBeenCalledTimes(1);
    expect(executeGraphQLMock).toHaveBeenCalledWith(
      expect.stringContaining('query MyAccountSettings'),
      {},
    );
    expect(executeGraphQLMock.mock.calls[0]?.[0]).toContain('myAccountSettings');
    expect(executeGraphQLMock.mock.calls[0]?.[0]).not.toContain('accountId');
  });

  it('读取失败原样上抛，由 application 的加载状态机收敛', async () => {
    const error = buildIngressError({ code: 'UNAUTHENTICATED' });
    executeGraphQLMock.mockRejectedValue(error);

    await expect(fetchMyAccountSettings()).rejects.toBe(error);
  });

  it('后端返回未知角色时守卫抛错，不降级成错误展示', async () => {
    executeGraphQLMock.mockResolvedValue({
      myAccountSettings: { ...SETTINGS_DTO, role: 'OPERATOR' },
    });

    await expect(fetchMyAccountSettings()).rejects.toThrow('账号设置返回了无法识别的角色。');
  });
});

describe('updateMyAccountSettingsProfile 三态 input 构造', () => {
  it('undefined 键省略（不修改）、null 保留（清空）、字符串原样传递（设置）', async () => {
    executeGraphQLMock.mockResolvedValue({
      updateMyAccountSettings: { isUpdated: true, settings: SETTINGS_DTO },
    });

    await updateMyAccountSettingsProfile({
      companyName: null,
      contactEmail: 'new-contact@example.com',
      loginEmail: undefined,
      loginName: 'renamed_user',
      nickname: '新昵称',
      phone: undefined,
    });

    expect(executeGraphQLMock).toHaveBeenCalledWith(expect.stringContaining('mutation'), {
      input: {
        companyName: null,
        contactEmail: 'new-contact@example.com',
        loginName: 'renamed_user',
        nickname: '新昵称',
      },
    });
    const input = executeGraphQLMock.mock.calls[0]?.[1] as { input: Record<string, unknown> };

    expect(Object.keys(input.input).sort()).toEqual([
      'companyName',
      'contactEmail',
      'loginName',
      'nickname',
    ]);
  });

  it('草稿全部字段缺省时提交空 input，adapter 不做 trim 或业务裁决', async () => {
    executeGraphQLMock.mockResolvedValue({
      updateMyAccountSettings: { isUpdated: false, settings: SETTINGS_DTO },
    });

    await updateMyAccountSettingsProfile({});

    expect(executeGraphQLMock).toHaveBeenCalledWith(expect.stringContaining('mutation'), {
      input: {},
    });
  });
});

describe('updateMyAccountSettingsProfile 成功', () => {
  it('返回后端权威视图与 isUpdated 标记', async () => {
    executeGraphQLMock.mockResolvedValue({
      updateMyAccountSettings: {
        isUpdated: true,
        settings: { ...SETTINGS_DTO, loginName: 'renamed_user' },
      },
    });

    await expect(updateMyAccountSettingsProfile({ loginName: 'renamed_user' })).resolves.toEqual({
      isUpdated: true,
      ok: true,
      settings: { ...SETTINGS_VIEW, loginName: 'renamed_user' },
    });
  });

  it('后端判定同值（isUpdated=false）时同样回传权威视图', async () => {
    executeGraphQLMock.mockResolvedValue({
      updateMyAccountSettings: { isUpdated: false, settings: SETTINGS_DTO },
    });

    await expect(updateMyAccountSettingsProfile({ nickname: '陈工' })).resolves.toEqual({
      isUpdated: false,
      ok: true,
      settings: SETTINGS_VIEW,
    });
  });
});

describe('updateMyAccountSettingsProfile 业务拒绝映射', () => {
  it.each<[string, AccountSettingsProfileFailureReason, string]>([
    ['BAD_USER_INPUT', 'invalid-input', '输入不符合要求，请检查后重新提交。'],
    ['CONFLICT', 'duplicate-credential', '登录名或登录邮箱已被占用，请更换后重试。'],
    ['FORBIDDEN', 'forbidden', '当前身份无权执行该操作。'],
    ['INTERNAL_SERVER_ERROR', 'update-failed', '操作失败，请稍后重试。'],
  ])('%s 映射为 %s 并使用该原因的兜底文案', async (code, reason, message) => {
    executeGraphQLMock.mockRejectedValue(buildIngressError({ code }));

    await expect(updateMyAccountSettingsProfile({ nickname: '新昵称' })).resolves.toEqual({
      message,
      ok: false,
      reason,
    });
  });

  it('extensions.errorMessage 存在时优先展示后端业务文案，大类码仍决定 reason', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildIngressError({
        code: 'CONFLICT',
        errorCode: 'MY_ACCOUNT_CREDENTIAL_CONFLICT',
        errorMessage: '登录邮箱已被占用',
      }),
    );

    await expect(
      updateMyAccountSettingsProfile({ loginEmail: 'taken@example.com' }),
    ).resolves.toEqual({ message: '登录邮箱已被占用', ok: false, reason: 'duplicate-credential' });
  });

  it('生产环境可能隐藏 errorMessage，此时回落到按 reason 的兜底文案', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildIngressError({
        code: 'BAD_USER_INPUT',
        errorCode: 'MY_ACCOUNT_LOGIN_CREDENTIAL_BOTH_EMPTY',
      }),
    );

    await expect(
      updateMyAccountSettingsProfile({ loginEmail: null, loginName: null }),
    ).resolves.toEqual({
      message: '输入不符合要求，请检查后重新提交。',
      ok: false,
      reason: 'invalid-input',
    });
  });
});

describe('updateMyAccountSettingsProfile 上抛边界', () => {
  it.each([['UNAUTHENTICATED'], ['NOT_FOUND'], ['OPERATION_UNKNOWN']])(
    '未登记的大类码 %s 原样上抛，交共享 ingress 链路处理',
    async (code) => {
      const error = buildIngressError({ code });
      executeGraphQLMock.mockRejectedValue(error);

      await expect(updateMyAccountSettingsProfile({ nickname: '新昵称' })).rejects.toBe(error);
    },
  );

  it('缺少大类 code（只有 errorCode 细化码）时不当作业务拒绝', async () => {
    const error = buildIngressError({ errorCode: 'MY_ACCOUNT_CREDENTIAL_CONFLICT' });
    executeGraphQLMock.mockRejectedValue(error);

    await expect(updateMyAccountSettingsProfile({ nickname: '新昵称' })).rejects.toBe(error);
  });

  it('网络类 ingress 错误（无 GraphQL 错误明细）原样上抛', async () => {
    const error = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    executeGraphQLMock.mockRejectedValue(error);

    await expect(updateMyAccountSettingsProfile({ nickname: '新昵称' })).rejects.toBe(error);
  });

  it('非 ingress 错误原样上抛，不被吞成业务拒绝', async () => {
    const error = new TypeError('unexpected');
    executeGraphQLMock.mockRejectedValue(error);

    await expect(updateMyAccountSettingsProfile({ nickname: '新昵称' })).rejects.toBe(error);
  });
});

describe('changeMyPassword', () => {
  it('入参原样进入 variables，成功只回传后端固定安全提示', async () => {
    executeGraphQLMock.mockResolvedValue({
      changeMyPassword: { isUpdated: true, notice: '密码已更新，请使用新密码重新登录' },
    });

    await expect(
      changeMyPassword({ currentPassword: 'Old#Pass2026', newPassword: 'Str0ng#Pass2026' }),
    ).resolves.toEqual({ notice: '密码已更新，请使用新密码重新登录', ok: true });

    expect(executeGraphQLMock).toHaveBeenCalledWith(
      expect.stringContaining('mutation ChangeMyPassword'),
      { input: { currentPassword: 'Old#Pass2026', newPassword: 'Str0ng#Pass2026' } },
    );
  });

  it('成功结果不携带密码、哈希、令牌或服务端撤销标记', async () => {
    executeGraphQLMock.mockResolvedValue({
      changeMyPassword: { isUpdated: true, notice: '密码已更新，请使用新密码重新登录' },
    });

    const result = await changeMyPassword({
      currentPassword: 'Old#Pass2026',
      newPassword: 'Str0ng#Pass2026',
    });

    expect(Object.keys(result).sort()).toEqual(['notice', 'ok']);
    expect(JSON.stringify(result)).not.toContain('Pass2026');
    expect(JSON.stringify(result)).not.toMatch(/revok|blacklist|撤销|失效|token/i);
  });

  it.each([
    ['BAD_USER_INPUT', 'invalid-input'],
    ['FORBIDDEN', 'forbidden'],
    ['INTERNAL_SERVER_ERROR', 'update-failed'],
  ])('%s 映射为 %s', async (code, reason) => {
    executeGraphQLMock.mockRejectedValue(buildIngressError({ code }));

    const result = await changeMyPassword({
      currentPassword: 'Old#Pass2026',
      newPassword: 'Str0ng#Pass2026',
    });

    expect(result).toMatchObject({ ok: false, reason });
  });

  it('当前密码错误与弱密码同属 BAD_USER_INPUT，优先展示后端文案', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildIngressError({
        code: 'BAD_USER_INPUT',
        errorCode: 'MY_ACCOUNT_CURRENT_PASSWORD_MISMATCH',
        errorMessage: '当前密码不正确',
      }),
    );

    await expect(
      changeMyPassword({ currentPassword: 'wrong', newPassword: 'Str0ng#Pass2026' }),
    ).resolves.toEqual({ message: '当前密码不正确', ok: false, reason: 'invalid-input' });
  });

  it('CONFLICT 不在改密映射表内，原样上抛（改密不把冲突当业务拒绝）', async () => {
    const error = buildIngressError({ code: 'CONFLICT' });
    executeGraphQLMock.mockRejectedValue(error);

    await expect(
      changeMyPassword({ currentPassword: 'Old#Pass2026', newPassword: 'Str0ng#Pass2026' }),
    ).rejects.toBe(error);
  });

  it('认证类失败原样上抛，由共享链路触发会话失效', async () => {
    const error = buildIngressError({ code: 'UNAUTHENTICATED' });
    executeGraphQLMock.mockRejectedValue(error);

    await expect(
      changeMyPassword({ currentPassword: 'Old#Pass2026', newPassword: 'Str0ng#Pass2026' }),
    ).rejects.toBe(error);
  });
});
