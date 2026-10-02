// src/pages/customer/index.tsx

import { CustomerRepairWorkspace } from '@/widgets/customer-repair-workspace';

// 维修申请管理页面（T-04 路由接线）：经本模块公开出口暴露给 app/router，
// 满足「跨模块导入只允许走公开 API」约束（app 不得深层 import pages 子目录）。
export { CustomerRepairRequestDetailRoute } from './repair-request-detail';
export { CustomerRepairRequestsPage } from './repair-requests';

/**
 * 客户工作台首页（PR5 整合工作台，负责人 2026-09-29 裁定：默认 create 态）。
 *
 * 首页、发起申请、我的申请、申请详情四个 URL 复用同一 CustomerRepairWorkspace
 * 与同一固定页头「客户页面」；本页只选择工作台模式（create），
 * 不再维护旧版两张全宽入口卡。角色治理由 protectedRouteLoader + auth-session 策略承担。
 */
export function CustomerPage() {
  return <CustomerRepairWorkspace mode="create" />;
}
