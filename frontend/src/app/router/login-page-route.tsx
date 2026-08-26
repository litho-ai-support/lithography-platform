// src/app/router/login-page-route.tsx

import { useNavigate, useSearchParams } from 'react-router';

import { LoginPage } from '@/pages/login';
import { resolveAuthSessionEntryPath } from '@/features/auth-session';

export function LoginPageRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return (
    <LoginPage
      onAuthenticated={(session) =>
        navigate(resolveAuthSessionEntryPath(session, searchParams.get('returnTo')))
      }
    />
  );
}
