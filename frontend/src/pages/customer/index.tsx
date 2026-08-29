// src/pages/customer/index.tsx

import { Button } from 'antd';
import { useNavigate } from 'react-router';

import {
  AuthSessionPanel,
  isAuthSessionRoleAllowedAt,
  useAuthSession,
} from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

// 「发起维修申请」的页面级入口：客户首页是创建页的唯一可发现入口
// （负责人裁定：本切片不留只能手输 URL 访问的页面）。
// 目标为受保护路由 /customer/repair-requests/new（见 app/router），
// 角色放行/拒绝由 protectedRouteLoader 治理。
const REPAIR_REQUEST_CREATE_PATH = '/customer/repair-requests/new';

export function CustomerPage() {
  const navigate = useNavigate();
  const { session, status } = useAuthSession();

  // 入口可用性与路由层同一判断函数对齐（2026-08-29 裁定：拒绝清单禁止超管进创建页）：
  // 被拒角色的按钮置灰并附文字说明，避免「点了被弹回」的无提示体验；
  // 未登录保持可点，沿用既有「点击 → 守卫跳 /login」链路。
  const canCreateRepairRequest =
    status !== 'authenticated' ||
    isAuthSessionRoleAllowedAt(session.role, REPAIR_REQUEST_CREATE_PATH);

  return (
    <div className="page-stack">
      <PageHeader
        description="CUSTOMER 临时落地页。当前身份来自后端登录结果，仅展示安全会话信息。"
        title="客户页面"
      />

      <div className="surface-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="font-medium">设备维修申请</div>
            <div className="text-text-secondary">
              设备出现异常时，提交故障信息创建维修申请，工程师将跟进处理。
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              disabled={!canCreateRepairRequest}
              onClick={() => navigate(REPAIR_REQUEST_CREATE_PATH)}
              size="large"
              type="primary"
            >
              发起维修申请
            </Button>
            {!canCreateRepairRequest ? (
              <div className="text-text-secondary text-xs">超管不能代客户发起维修申请</div>
            ) : null}
          </div>
        </div>
      </div>

      <AuthSessionPanel />
    </div>
  );
}
