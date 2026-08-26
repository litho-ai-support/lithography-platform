// src/pages/repair-request-create/index.tsx

import { RepairRequestForm } from '@/features/repair-request';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 创建维修申请页面。
 *
 * 阶段四暂不挂受保护路由；阶段五由蔡的登录/Session 合并后
 * 接入正式客户路由 /customer/repair-requests/new。
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
