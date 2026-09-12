// src/pages/admin/index.tsx

import { RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { AuthSessionPanel } from '@/features/auth-session';

import { PageHeader } from '@/shared/ui/page-header';

/**
 * 管理员入口页：保留会话信息展示，并提供进入用户管理页面的明确导航入口。
 * 页面本身位于 /admin/**，由路由层既有角色策略保证仅 SUPER_ADMIN 可达。
 */
export function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="page-stack">
      <PageHeader
        description="SUPER_ADMIN 管理员入口。当前身份来自后端登录结果，可进入用户管理页面执行完整管理动作。"
        extra={
          <Button type="primary" onClick={() => void navigate('/admin/users')}>
            进入用户管理
            <RightOutlined />
          </Button>
        }
        title="管理员页面"
      />

      <AuthSessionPanel />
    </div>
  );
}
