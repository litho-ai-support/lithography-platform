// src/pages/account-settings/index.tsx

import { useNavigate } from 'react-router';

import { AccountSettingsPanel } from '@/features/account-settings';
import { logoutAuthSession } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 账号设置页：只负责页头与组合 feature 公开 UI，以及修改密码成功后的会话收口。
 * 修改密码会使既有会话失效：清理 auth-session 的唯一会话真源后跳转登录页；
 * 登出清理本身失败不阻塞跳转（与 LogoutButton 同一口径），会话状态交由失效链路收敛。
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
      />
    </div>
  );
}
