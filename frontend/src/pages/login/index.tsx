// src/pages/login/index.tsx

import type { AuthSessionView } from '@/features/auth-session';
import { LoginForm, SessionExpiredNotice } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

export type LoginPageProps = {
  onAuthenticated?: (session: AuthSessionView) => void;
  // 仅在失效原因为预定义的 session-expired 时由路由层传入；普通访问、
  // 主动退出与未登录访问都不携带失效提示。
  sessionExpired?: boolean;
};

export function LoginPage({ onAuthenticated, sessionExpired = false }: LoginPageProps) {
  return (
    <div className="page-stack">
      <PageHeader
        description="使用项目账号登录。系统会根据后端返回的身份进入对应工作区。"
        title="登录"
      />

      <div className="mx-auto w-full max-w-md">
        <div className="surface-panel">
          {sessionExpired ? (
            <div className="mb-4">
              <SessionExpiredNotice visible />
            </div>
          ) : null}
          <LoginForm onAuthenticated={onAuthenticated} />
        </div>
      </div>
    </div>
  );
}
