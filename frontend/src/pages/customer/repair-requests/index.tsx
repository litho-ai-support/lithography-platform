// src/pages/customer/repair-requests/index.tsx

import { CustomerRepairWorkspace } from '@/widgets/customer-repair-workspace';

/**
 * 客户「我的维修申请」历史列表路由壳（PR5 整合工作台）。
 *
 * 只选择工作台模式（history-list）：列表渲染、分页、删除与选中联动全部由
 * CustomerRepairWorkspace 组合 repair-request feature 的状态机完成；
 * 原页面级全宽表格已拆为可复用的客户列表面板（feature ui，
 * CustomerRepairRequestListPanel），供工作台左栏装配。
 */
export function CustomerRepairRequestsPage() {
  return <CustomerRepairWorkspace mode="history-list" />;
}
