// src/pages/admin/index.tsx

import { AuthSessionPanel } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

export function AdminPage() {
  return (
    <div className="page-stack">
      <PageHeader
        description="SUPER_ADMIN 临时落地页。当前身份来自后端登录结果，仅展示安全会话信息。"
        title="管理员页面"
      />

      <AuthSessionPanel />
    </div>
  );
}
