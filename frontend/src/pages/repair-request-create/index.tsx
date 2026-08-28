// src/pages/repair-request-create/index.tsx

import { RepairRequestForm } from '@/features/repair-request';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 创建维修申请页面。
 *
 * 挂受保护路由 /customer/repair-requests/new（见 app/router），
 * 角色入口治理由蔡的 protectedRouteLoader / auth-session 策略承担。
 */
export function RepairRequestCreatePage() {
  return (
    <div className="page-stack">
      <PageHeader description="提交设备故障信息，创建维修申请。" title="创建维修申请" />
      <div className="surface-panel">
        <div className="max-w-xl">
          <RepairRequestForm />
        </div>
      </div>
    </div>
  );
}
