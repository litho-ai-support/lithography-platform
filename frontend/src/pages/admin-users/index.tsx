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
        description="面向 SUPER_ADMIN 的用户管理：服务端分页查询、创建用户、资料编辑、角色修改、启用/停用与密码重置。"
        title="用户管理"
      />

      <AdminUserManagementPanel />
    </div>
  );
}
