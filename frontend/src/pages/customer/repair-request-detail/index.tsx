// src/pages/customer/repair-request-detail/index.tsx

import { useParams } from 'react-router';

import { CustomerRepairWorkspace } from '@/widgets/customer-repair-workspace';

import { parseRepairRequestIdParam } from './repair-request-id-param';

/**
 * 客户维修申请详情路由壳（PR5 整合工作台）。
 *
 * 从路径参数解析 requestId 后注入工作台（history-detail 模式）：URL 的 requestId
 * 是详情目标的唯一真值；解析结果固定为「有效正整数 | null」（契约与边界矩阵见
 * ./repair-request-id-param），工作台据此显式区分「非法详情 URL」（history-detail + null）
 * 与「列表暂无默认详情」（history-list 空库）。
 * 原页面级详情渲染已拆为可复用的详情面板（feature ui，
 * CustomerRepairRequestDetailPanel），供工作台右栏装配。
 */
export function CustomerRepairRequestDetailRoute() {
  const { requestId } = useParams();

  return (
    <CustomerRepairWorkspace
      mode="history-detail"
      requestId={parseRepairRequestIdParam(requestId)}
    />
  );
}
