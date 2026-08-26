// src/features/auth-session/ui/logout-button.tsx

import { useState } from 'react';
import { Button } from 'antd';
import { useNavigate } from 'react-router';

import { logoutAuthSession } from '../auth-session-entry';

export function LogoutButton() {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logoutAuthSession();
    } catch {
      // 清理失败不应阻断回到登录页；会话状态交由失效链路收敛。
    }

    navigate('/login');
  }

  return (
    <Button disabled={isLoggingOut} loading={isLoggingOut} onClick={() => void handleLogout()}>
      退出登录
    </Button>
  );
}
