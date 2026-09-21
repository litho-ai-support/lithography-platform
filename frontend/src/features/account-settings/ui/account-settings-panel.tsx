// src/features/account-settings/ui/account-settings-panel.tsx

/**
 * 账号设置面板：账号信息 / 基础资料 / 安全设置三个独立区块的组合层。
 *
 * GraphQL 请求收束在 infrastructure，本层只消费 application 的视图状态与命令执行结果；
 * 修改密码成功后的会话收口（清理会话真源并跳转登录页）不落在 feature 内——经
 * `onPasswordChangeSucceeded` 由页面装配层接线，避免 features 之间互相引用。
 */

import { Space, Typography } from 'antd';

import { PrimaryButton } from '@/shared/ui/buttons';
import { DataCard } from '@/shared/ui/data-card';
import { ErrorState } from '@/shared/ui/error-state';
import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { LoadingState } from '@/shared/ui/loading-state';
import { StatusPill, type StatusPillTone } from '@/shared/ui/status-pill';

import type {
  AccountSettingsStatus,
  AccountSettingsView,
  ChangePasswordSessionIdentity,
} from '../application/account-settings.types';
import {
  ACCOUNT_SETTINGS_ROLE_LABELS,
  ACCOUNT_SETTINGS_STATUS_LABELS,
} from '../application/account-settings.types';
import { useAccountSettings } from '../application/use-account-settings';

import { AccountCredentialsForm } from './account-credentials-form';
import { AccountProfileForm } from './account-profile-form';
import { ChangePasswordForm } from './change-password-form';

/** 状态只读展示的胶囊色调；角色恒用中性色（无褒贬语义） */
const STATUS_PILL_TONES: Record<AccountSettingsStatus, StatusPillTone> = {
  ACTIVE: 'ok',
  BANNED: 'critical',
  DELETED: 'critical',
  INACTIVE: 'neutral',
  PENDING: 'warn',
  SUSPENDED: 'warn',
};

type AccountSettingsPanelProps = {
  /**
   * 修改密码成功后的会话收口（登出 + 跳转登录页），由页面装配层提供。
   * 第一参为请求发起前采样固化的会话身份，装配层与当前会话比对后决定是否清理。
   * 身份裁决先于成功提示：返回 `false` 表示身份已不匹配（迟到响应被忽略），
   * 表单对该次响应完全静默、不展示成功提示。
   */
  onPasswordChangeSucceeded?: (
    initiatedIdentity: ChangePasswordSessionIdentity | null,
  ) => boolean | Promise<boolean>;
  /**
   * 资料保存成功且结果未过期时的回调（页面装配层借此把昵称回写会话真源）。
   * 第二参为请求发起前采样的账号 ID（null 表示装配层未接入采样）。
   */
  onProfileSaveSucceeded?: (
    settings: AccountSettingsView,
    expectedAccountId: number | null,
  ) => void;
  /** 请求发起前的账号身份采样（页面装配层注入会话真源读取），见 useAccountSettings */
  sampleAccountId?: () => number | null;
  /** 请求发起前的会话代次采样（页面装配层注入会话真源读取），见 useAccountSettings */
  sampleSessionIdentity?: () => ChangePasswordSessionIdentity | null;
};

export function AccountSettingsPanel({
  onPasswordChangeSucceeded,
  onProfileSaveSucceeded,
  sampleAccountId,
  sampleSessionIdentity,
}: AccountSettingsPanelProps) {
  const { isPending, reload, state, updatePassword, updateProfile } = useAccountSettings({
    onProfileSaved: onProfileSaveSucceeded,
    sampleAccountId,
    sampleSessionIdentity,
  });

  if (state.status === 'loading') {
    return <LoadingState label="账号设置加载中…" />;
  }

  if (state.status === 'failed') {
    return (
      <ErrorState
        action={<PrimaryButton onClick={reload}>重试</PrimaryButton>}
        description={state.message}
        title="账号设置加载失败"
      />
    );
  }

  const { settings } = state;

  return (
    <div className="flex flex-col gap-5">
      <DataCard
        extra={
          <Space size={12}>
            <Space size={4}>
              <Typography.Text type="secondary">角色</Typography.Text>
              <StatusPill tone="neutral">{ACCOUNT_SETTINGS_ROLE_LABELS[settings.role]}</StatusPill>
            </Space>
            <Space size={4}>
              <Typography.Text type="secondary">状态</Typography.Text>
              <StatusPill tone={STATUS_PILL_TONES[settings.status]}>
                {ACCOUNT_SETTINGS_STATUS_LABELS[settings.status]}
              </StatusPill>
            </Space>
          </Space>
        }
        title="账号信息"
      >
        <div className="mb-4">
          <Typography.Text type="secondary">
            最近变更：{formatDateTimeText(settings.updatedAt)}
          </Typography.Text>
        </div>

        <AccountCredentialsForm
          onSubmit={updateProfile}
          settings={settings}
          submitting={isPending('update-profile')}
        />
      </DataCard>

      <DataCard title="基础资料">
        <AccountProfileForm
          onSubmit={updateProfile}
          settings={settings}
          submitting={isPending('update-profile')}
        />
      </DataCard>

      <DataCard title="安全设置">
        <ChangePasswordForm
          onSucceeded={onPasswordChangeSucceeded}
          onSubmit={updatePassword}
          submitting={isPending('change-password')}
        />
      </DataCard>
    </div>
  );
}
