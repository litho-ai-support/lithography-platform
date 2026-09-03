// src/pages/engineer-repair-requests/index.tsx

import { EngineerRepairRequestList } from '@/features/repair-request';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 工程师维修申请列表页。
 *
 * 路由 /engineer/repair-requests 在 app/router 注册并复用
 * protectedRouteLoader；页面只装配 feature 公开组件，不持有 Session、
 * Token、角色映射或另一份列表真源。
 */
export function EngineerRepairRequestsPage() {
  return (
    <div className="page-stack">
      <PageHeader description="查看待接单维修申请与你已接单的维修申请。" title="工程师维修申请" />
      <EngineerRepairRequestList />
    </div>
  );
}
