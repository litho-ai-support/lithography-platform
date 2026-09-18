// src/features/account-settings/application/use-account-settings.ts

/**
 * 账号设置的读取与写命令执行入口（收束在 feature application）。
 *
 * - 读取：挂载即加载；transport / auth 失败收敛为 failed 状态与兜底文案，
 *   UNAUTHENTICATED 的会话失效处理仍由共享 ingress 链路负责；
 * - 写命令（资料更新 / 修改密码）：各持独立的 in-flight 键，同类命令进行中
 *   拒绝重复提交；命令的显式业务结果（成功 / 业务拒绝）由 adapter 归一后透传；
 * - 陈旧响应防护：与 use-admin-user-list 的 requestSeq 同一口径——单调递增的
 *   action 序列标记每一次读取 / 写命令的发起，结果回来时序列已推进即整体丢弃，
 *   既不让过期读取覆盖新视图，也不让过期写结果覆盖用户的后续输入；
 * - 日志安全边界：命令失败日志只记录 error 对象，不得携带命令入参
 *   （changeMyPassword 的入参是明文密码）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isGraphQLIngressError } from '@/shared/graphql';

import {
  changeMyPassword,
  fetchMyAccountSettings,
  updateMyAccountSettingsProfile,
} from '../infrastructure/account-settings-adapter';

import type {
  AccountSettingsProfileDraft,
  AccountSettingsProfileUpdateResult,
  AccountSettingsView,
  ChangeMyPasswordInput,
  ChangeMyPasswordResult,
} from './account-settings.types';

export type AccountSettingsState =
  | { message: string; status: 'failed' }
  | { settings: AccountSettingsView; status: 'ready' }
  | { status: 'loading' };

export type AccountSettingsCommandKey = 'change-password' | 'update-profile';

export type AccountSettingsCommandExecution<T> =
  | { kind: 'ok'; result: T }
  | { kind: 'in-flight' }
  | { kind: 'unhandled-error'; message: string };

const UNHANDLED_FALLBACK_MESSAGE = '操作失败，请稍后重试。';

function toUnhandledUserMessage(error: unknown): string {
  return isGraphQLIngressError(error) ? error.userMessage : UNHANDLED_FALLBACK_MESSAGE;
}

const LOAD_FAILED_MESSAGE = '账号设置加载失败，请稍后重试。';

export function useAccountSettings() {
  const [state, setState] = useState<AccountSettingsState>({ status: 'loading' });
  // 单调递增的动作序列：每次读取 / 写命令发起时 +1，结果回来时不再等于发起值即陈旧
  const actionSeqRef = useRef(0);
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<AccountSettingsCommandKey>>(new Set());
  const pendingKeysRef = useRef<ReadonlySet<AccountSettingsCommandKey>>(new Set());

  const setPending = useCallback((key: AccountSettingsCommandKey, pending: boolean) => {
    const next = new Set(pendingKeysRef.current);

    if (pending) {
      next.add(key);
    } else {
      next.delete(key);
    }

    pendingKeysRef.current = next;
    setPendingKeys(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      actionSeqRef.current += 1;
      const actionSeq = actionSeqRef.current;

      setState({ status: 'loading' });

      try {
        const settings = await fetchMyAccountSettings();

        if (!cancelled && actionSeqRef.current === actionSeq) {
          setState({ settings, status: 'ready' });
        }
      } catch (error) {
        if (!isGraphQLIngressError(error)) {
          // 非 ingress 错误（如 mapper 守卫抛出）原始信息只保留在控制台，
          // 避免收敛文案后线上无法排障
          console.error('账号设置加载出现未分类错误：', error);
        }

        if (!cancelled && actionSeqRef.current === actionSeq) {
          setState({ message: LOAD_FAILED_MESSAGE, status: 'failed' });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  /** 按当前事实重新加载（写命令不走本入口：写结果自带权威视图，见 updateProfile） */
  const reload = useCallback(() => {
    actionSeqRef.current += 1;
    const actionSeq = actionSeqRef.current;

    setState({ status: 'loading' });

    void fetchMyAccountSettings()
      .then((settings) => {
        if (actionSeqRef.current === actionSeq) {
          setState({ settings, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!isGraphQLIngressError(error)) {
          console.error('账号设置加载出现未分类错误：', error);
        }

        if (actionSeqRef.current === actionSeq) {
          setState({ message: LOAD_FAILED_MESSAGE, status: 'failed' });
        }
      });
  }, []);

  /**
   * 资料更新：成功时把 adapter 返回的权威视图写回状态（仅当序列未推进——
   * 期间若用户又发起了别的动作，过期结果不得覆盖新状态）。
   */
  const updateProfile = useCallback(
    async (
      draft: AccountSettingsProfileDraft,
    ): Promise<AccountSettingsCommandExecution<AccountSettingsProfileUpdateResult>> => {
      if (pendingKeysRef.current.has('update-profile')) {
        return { kind: 'in-flight' };
      }

      actionSeqRef.current += 1;
      const actionSeq = actionSeqRef.current;
      setPending('update-profile', true);

      try {
        const result = await updateMyAccountSettingsProfile(draft);

        if (result.ok && actionSeqRef.current === actionSeq) {
          setState({ settings: result.settings, status: 'ready' });
        }

        return { kind: 'ok', result };
      } catch (error) {
        if (!isGraphQLIngressError(error)) {
          console.error('账号设置更新出现未分类错误：', error);
        }

        return { kind: 'unhandled-error', message: toUnhandledUserMessage(error) };
      } finally {
        setPending('update-profile', false);
      }
    },
    [setPending],
  );

  /** 修改密码：成功结果只回传固定提示，会话收口由页面装配层接线执行。 */
  const updatePassword = useCallback(
    async (
      input: ChangeMyPasswordInput,
    ): Promise<AccountSettingsCommandExecution<ChangeMyPasswordResult>> => {
      if (pendingKeysRef.current.has('change-password')) {
        return { kind: 'in-flight' };
      }

      actionSeqRef.current += 1;
      setPending('change-password', true);

      try {
        const result = await changeMyPassword(input);

        return { kind: 'ok', result };
      } catch (error) {
        if (!isGraphQLIngressError(error)) {
          // 安全边界：不得打印命令入参（currentPassword / newPassword 为明文）；
          // ingress 错误对象不含 variables，可安全记录
          console.error('修改密码出现未分类错误：', error);
        }

        return { kind: 'unhandled-error', message: toUnhandledUserMessage(error) };
      } finally {
        setPending('change-password', false);
      }
    },
    [setPending],
  );

  const isPending = useCallback(
    (key: AccountSettingsCommandKey) => pendingKeys.has(key),
    [pendingKeys],
  );

  return { isPending, reload, state, updatePassword, updateProfile };
}
