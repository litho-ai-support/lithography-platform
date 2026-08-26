// src/features/auth-session/index.ts

export type {
  AuthSessionRole,
  AuthSessionUserSummary,
  AuthSessionView,
  AuthSessionViewState,
} from './application/auth-session.types';
export { AUTH_SESSION_ROLES } from './application/auth-session.types';
export {
  isAuthSessionRole,
  resolveAuthSessionHomePath,
  resolveLoginRouteRedirect,
} from './application/auth-session-policy';
export {
  getAuthSessionAccessToken,
  getCurrentAuthSession,
  loginWithPassword,
} from './auth-session-entry';
export { useAuthSession } from './ui/auth-session-context';
export { AuthSessionProvider } from './ui/auth-session-provider';
export { LoginForm, type LoginFormProps } from './ui/login-form';
