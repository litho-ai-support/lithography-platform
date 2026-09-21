// src/features/auth-session/application/auth-session-store.ts

import type {
  AuthSessionPersistence,
  AuthSessionState,
  EstablishAuthSessionInput,
} from './auth-session.types';
import { createAuthSessionSnapshot } from './auth-session-policy';

type AuthSessionListener = () => void;

const ANONYMOUS_AUTH_SESSION_STATE: AuthSessionState = {
  session: null,
  status: 'anonymous',
};

export type AuthSessionStore = {
  clearSession: () => void;
  establishSession: (input: EstablishAuthSessionInput) => void;
  getSnapshot: () => AuthSessionState;
  restoreSession: () => void;
  /**
   * 仅更新显示昵称的窄入口：accountId 与当前会话一致且新昵称合法时，
   * 同步写持久化（sessionStorage）与内存状态并发布；其余情况一律不更新。
   * 返回是否发生了更新（供调用方在需要时感知）。
   */
  updateNickname: (input: { accountId: number; nickname: string }) => boolean;
  subscribe: (listener: AuthSessionListener) => () => void;
};

function restoreState(persistence: AuthSessionPersistence): AuthSessionState {
  const session = persistence.read();

  return session
    ? {
        session,
        status: 'authenticated',
      }
    : ANONYMOUS_AUTH_SESSION_STATE;
}

export function createAuthSessionStore(persistence: AuthSessionPersistence): AuthSessionStore {
  const listeners = new Set<AuthSessionListener>();
  let state = restoreState(persistence);

  function publish(nextState: AuthSessionState) {
    state = nextState;
    listeners.forEach((listener) => listener());
  }

  return {
    clearSession() {
      persistence.clear();
      publish(ANONYMOUS_AUTH_SESSION_STATE);
    },
    establishSession(input) {
      const session = createAuthSessionSnapshot(input);

      persistence.write(session);
      publish({ session, status: 'authenticated' });
    },
    getSnapshot() {
      return state;
    },
    restoreSession() {
      publish(restoreState(persistence));
    },
    updateNickname({ accountId, nickname }) {
      const current = state.session;

      // 目标账号必须就是当前会话账号：账号设置只能改自己，不匹配视为
      // 「请求来自过期视图」直接忽略，绝不写入
      if (!current || current.accountId !== accountId) {
        return false;
      }

      // 无 userInfo 的会话没有显示昵称面（侧栏回退「当前用户」），无从更新
      if (!current.userInfo) {
        return false;
      }

      // 复用 snapshot 工厂完成 trim 与全部不变量校验（accessGroup / 角色一致性）；
      // 校验失败抛错属会话数据不变量被破坏，不在本方法内静默吞掉
      const next = createAuthSessionSnapshot({
        accessToken: current.accessToken,
        accountId: current.accountId,
        role: current.role,
        userInfo: {
          ...current.userInfo,
          nickname,
        },
      });

      persistence.write(next);
      publish({ session: next, status: 'authenticated' });

      return true;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
