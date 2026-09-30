// src/pages/customer/repair-request-detail/index.tsx

import { useParams } from 'react-router';

import { CustomerRepairWorkspace } from '@/widgets/customer-repair-workspace';

/**
 * 客户维修申请详情路由壳（PR5 整合工作台）。
 *
 * 从路径参数解析 requestId 后注入工作台（history-detail 模式）：
 * URL 的 requestId 是详情目标的唯一真值；非数字参数经 Number() 归为 NaN，
 * 交由详情统一 not-found 口径处理（与后端防探测一致）。
 * 原页面级详情渲染已拆为可复用的详情面板（feature ui，
 * CustomerRepairRequestDetailPanel），供工作台右栏装配。
 */
export function CustomerRepairRequestDetailRoute() {
  const { requestId } = useParams();

  return <CustomerRepairWorkspace mode="history-detail" requestId={Number(requestId)} />;
}
