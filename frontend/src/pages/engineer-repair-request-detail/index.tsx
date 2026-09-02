// src/pages/engineer-repair-request-detail/index.tsx

/**
 * 工程师维修申请详情页：只装配，不含业务请求。
 *
 * - 路由参数解析是页面层对 URL 的窄职责：非正整数 ID 归一为 null，
 *   feature 对 null 走静态统一不可访问反馈，不产生 GraphQL 请求；
 * - 接单可见性由页面层基于会话单值业务角色判定后以布尔传入：
 *   读权限继承不等于接单权限，仅精确 ENGINEER 展示接单操作；
 * - key 随路由参数强制隔离：参数直接变化时重建面板实例，
 *   上一申请的接单反馈/流程状态不带到下一申请；
 * - 详情展示、接单流程与反馈全部来自 feature 公开 barrel；
 * - 路由由 app/router 注册并复用 protectedRouteLoader。
 */

import { useParams } from 'react-router';

import { useAuthSession } from '@/features/auth-session';
import { EngineerRepairRequestDetailPanel } from '@/features/repair-request';

import { PageHeader } from '@/shared/ui/page-header';

function parseRequestId(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function EngineerRepairRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { session, status } = useAuthSession();
  const parsedRequestId = parseRequestId(requestId);

  // session.role 是后端登录角色决策产出的单值业务角色；
  // SUPER_ADMIN 继承的是读权限，不展示接单操作（后端守卫 + usecase 双重拦截仍在）。
  const canAccept = status === 'authenticated' && session.role === 'ENGINEER';

  return (
    <div className="page-stack">
      <PageHeader
        description="查看维修申请详情与工程师回复，工程师可直接接单跟进处理。"
        title="维修申请详情"
      />
      <EngineerRepairRequestDetailPanel
        canAccept={canAccept}
        key={parsedRequestId === null ? 'invalid' : parsedRequestId}
        requestId={parsedRequestId}
      />
    </div>
  );
}
