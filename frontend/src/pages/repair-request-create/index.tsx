// src/pages/repair-request-create/index.tsx

import { CustomerRepairWorkspace } from '@/widgets/customer-repair-workspace';

/**
 * 创建维修申请兼容入口路由壳（挂受保护路由 /customer/repair-requests/new）。
 *
 * PR5 整合工作台裁定：本路由与客户首页默认态渲染完全一致的 create 态工作台
 * （不生成第二标题、不复制表单实现）；表单继续复用 RepairRequestForm，
 * 由 CustomerRepairWorkspace 统一组合。角色入口治理由 protectedRouteLoader /
 * auth-session 策略承担（拒绝清单仍仅拒本路径）。
 */
export function RepairRequestCreatePage() {
  return <CustomerRepairWorkspace mode="create" />;
}
