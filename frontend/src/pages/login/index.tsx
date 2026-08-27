// src/pages/login/index.tsx

import type { AuthSessionView } from '@/features/auth-session';
import { LoginForm } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

export type LoginPageProps = {
  onAuthenticated?: (session: AuthSessionView) => void;
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  return (
    <div className="page-stack">
      <PageHeader
        description="使用项目账号登录。系统会根据后端返回的身份进入对应工作区。"
        title="登录"
      />

      <div className="mx-auto w-full max-w-md">
        <div className="surface-panel">
          <LoginForm onAuthenticated={onAuthenticated} />
        </div>
      </div>
    </div>
  );
}
