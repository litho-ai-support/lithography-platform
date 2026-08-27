// src/pages/engineer/index.tsx

import { AuthSessionPanel } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

export function EngineerPage() {
  return (
    <div className="page-stack">
      <PageHeader
        description="ENGINEER 临时落地页。当前身份来自后端登录结果，仅展示安全会话信息。"
        title="工程师页面"
      />

      <AuthSessionPanel />
    </div>
  );
}
