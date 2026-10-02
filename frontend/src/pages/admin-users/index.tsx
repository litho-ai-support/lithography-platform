// src/pages/admin-users/index.tsx

import { AdminUserManagementPanel } from '@/features/admin-user-management';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 用户管理页：只负责标题、布局与组合 feature 公开 UI，
 * 业务状态、GraphQL 调用与权限展示策略全部收束在 features/admin-user-management。
 */
export function AdminUsersPage() {
  return (
    <div className="page-stack">
      <PageHeader
        description="查看和管理平台账号、基本资料与账号状态。"
        eyebrow="User Management"
        title="用户管理"
      />

      <AdminUserManagementPanel />
    </div>
  );
}
