// src/pages/engineer/index.tsx

import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { AuthSessionPanel } from '@/features/auth-session';
import { ENGINEER_REPAIR_REQUEST_LIST_PATH } from '@/features/repair-request';

import { PageHeader } from '@/shared/ui/page-header';

// 「维修申请」的页面级入口：工程师首页是维修申请列表的唯一可发现入口
// （与客户首页入口同一裁定：本切片不留只能手输 URL 访问的页面）。
// 目标为受保护路由 /engineer/repair-requests（见 app/router），
// ENGINEER 与 SUPER_ADMIN 均由 protectedRouteLoader 的带边界前缀规则放行。

export function EngineerPage() {
  const navigate = useNavigate();

  return (
    <div className="page-stack">
      <PageHeader
        description="ENGINEER 工作区。当前身份来自后端登录结果，提供维修申请接单入口与安全会话信息。"
        title="工程师页面"
      />

      <div className="surface-panel">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="font-medium">维修申请接单</div>
            <div className="text-text-secondary">
              查看待接单的维修申请并接单跟进，也可以查看你已接单的维修申请。
            </div>
          </div>
          <Button
            onClick={() => navigate(ENGINEER_REPAIR_REQUEST_LIST_PATH)}
            size="large"
            type="primary"
          >
            进入维修申请
          </Button>
        </div>
      </div>

      <AuthSessionPanel />
    </div>
  );
}
