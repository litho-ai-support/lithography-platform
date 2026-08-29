// src/app/router/login-page-route.tsx

import { useNavigate, useSearchParams } from 'react-router';

import { LoginPage } from '@/pages/login';
import {
  isAuthSessionExpiredReason,
  readAuthLoginReasonParam,
  readAuthReturnToParam,
  resolveAuthSessionEntryPath,
} from '@/features/auth-session';

export function LoginPageRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <LoginPage
      // 失效提示仅由受控的 reason=session-expired 触发；普通访问与主动退出无提示。
      sessionExpired={isAuthSessionExpiredReason(readAuthLoginReasonParam(searchParams))}
      onAuthenticated={(session) =>
        navigate(resolveAuthSessionEntryPath(session, readAuthReturnToParam(searchParams)))
      }
    />
  );
}
