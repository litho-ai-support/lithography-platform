// src/pages/customer/index.tsx

import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { AuthSessionPanel } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

// 「发起维修申请」的页面级入口：客户首页是创建页的唯一可发现入口
// （负责人裁定：本切片不留只能手输 URL 访问的页面）。
// 目标为受保护路由 /customer/repair-requests/new（见 app/router），
// 角色放行/拒绝由 protectedRouteLoader 治理，此处不做角色判断。
const REPAIR_REQUEST_CREATE_PATH = '/customer/repair-requests/new';

export function CustomerPage() {
  const navigate = useNavigate();

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
          <Button onClick={() => navigate(REPAIR_REQUEST_CREATE_PATH)} size="large" type="primary">
            发起维修申请
          </Button>
        </div>
      </div>

      <AuthSessionPanel />
    </div>
  );
}
