// src/features/auth-session/ui/auth-session-panel.tsx

import { Alert, Button, Descriptions, Tag } from 'antd';
import { useNavigate } from 'react-router';

import { useAuthSession } from './auth-session-context';
import { LogoutButton } from './logout-button';

export function AuthSessionPanel() {
  const navigate = useNavigate();
  const { session, status } = useAuthSession();

  // 防御性分支：当前只挂载在受 loader 守卫的角色页，理论上不可达；
  // 保留是为了将来复用到非受保护场景时仍给出明确提示而不是空白。
  if (status !== 'authenticated' || !session) {
    return (
      <div className="surface-panel">
        <Alert message="当前会话不可用，请先登录。" showIcon type="warning" />
        <div className="page-action-row">
          <Button type="primary" onClick={() => navigate('/login')}>
            前往登录
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-panel">
      <div className="flex flex-col gap-4">
        <Alert
          description={`当前身份：${session.role}。本页面只展示后端返回的安全会话信息。`}
          message="登录成功"
          showIcon
          type="success"
        />

        <Descriptions
          bordered
          column={{ lg: 2, md: 1, sm: 1, xs: 1 }}
          items={[
            {
              children: <Tag color="blue">{session.role}</Tag>,
              key: 'role',
              label: '当前角色',
            },
            {
              children: session.accountId,
              key: 'accountId',
              label: '账号 ID',
            },
            {
              children: session.userInfo?.nickname ?? '—',
              key: 'nickname',
              label: '昵称',
            },
            {
              children: session.userInfo ? (
                <div className="flex flex-wrap gap-1">
                  {session.userInfo.accessGroup.map((role) => (
                    <Tag key={role}>{role}</Tag>
                  ))}
                </div>
              ) : (
                '—'
              ),
              key: 'accessGroup',
              label: '访问组',
            },
          ]}
        />

        <div className="page-action-row">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
