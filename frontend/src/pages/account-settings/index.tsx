// src/pages/account-settings/index.tsx

import { useNavigate } from 'react-router';

import { AccountSettingsPanel } from '@/features/account-settings';
import {
  getCurrentAuthSession,
  logoutAuthSession,
  updateCurrentAuthSessionNickname,
} from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 账号设置页：只负责页头与组合 feature 公开 UI，以及两条会话侧写的接线。
 *
 * 修改密码会使既有会话失效：清理 auth-session 的唯一会话真源后跳转登录页；
 * 登出清理本身失败不阻塞跳转（与 LogoutButton 同一口径），会话状态交由失效链路收敛。
 * 资料保存成功则把权威昵称经窄入口回写会话真源（内存 + sessionStorage 同步），
 * 侧栏显示随之更新。身份口径：accountId 在**请求发起前**经 sampleAccountId 采样固化，
 * 迟到响应携带的仍是发起者身份；store 与当前会话比对不匹配即拒绝，
 * A 发起保存后切换到 B 的场景不会把 A 的昵称写进 B 的会话。
 */
export function AccountSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="page-stack">
      <PageHeader description="维护登录凭据、基础资料与登录密码。" title="账号设置" />

      <AccountSettingsPanel
        onPasswordChangeSucceeded={async () => {
          try {
            await logoutAuthSession();
          } catch {
            // 清理失败（如缓存重置异常）不阻断回到登录页
          }

          navigate('/login');
        }}
        onProfileSaveSucceeded={(settings, expectedAccountId) => {
          if (expectedAccountId !== null) {
            updateCurrentAuthSessionNickname(expectedAccountId, settings.nickname);
          }
        }}
        sampleAccountId={() => getCurrentAuthSession()?.accountId ?? null}
      />
    </div>
  );
}
