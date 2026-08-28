// src/features/auth-session/index.ts

export type {
  AuthSessionRole,
  AuthSessionUserSummary,
  AuthSessionView,
  AuthSessionViewState,
} from './application/auth-session.types';
export { AUTH_SESSION_ROLES } from './application/auth-session.types';
export {
  type AuthSessionRoleCarrier,
  isAuthSessionRole,
  resolveAuthSessionEntryPath,
  resolveAuthSessionHomePath,
  resolveEntryRouteRedirect,
  resolveLoginRouteRedirect,
  resolveProtectedRouteRedirect,
  resolveSafeReturnTo,
} from './application/auth-session-policy';
export {
  getAuthSessionAccessToken,
  getCurrentAuthSession,
  logoutAuthSession,
} from './auth-session-entry';
export {
  AUTH_RETURN_TO_PARAM_KEY,
  composeLoginRedirectPath,
  composeProtectedRequestTarget,
  extractUrlPathname,
  readAuthReturnToFromRequest,
  readAuthReturnToParam,
} from './infrastructure/auth-return-to-url';
export { useAuthSession } from './ui/auth-session-context';
export { AuthSessionPanel } from './ui/auth-session-panel';
export { AuthSessionProvider } from './ui/auth-session-provider';
export { LoginForm, type LoginFormProps } from './ui/login-form';
export { LogoutButton } from './ui/logout-button';
