// src/features/auth-session/application/auth-session.types.ts

export const AUTH_SESSION_ROLES = ['SUPER_ADMIN', 'ENGINEER', 'CUSTOMER'] as const;

export type AuthSessionRole = (typeof AUTH_SESSION_ROLES)[number];

export type AuthSessionUserSummary = {
  accessGroup: readonly AuthSessionRole[];
  nickname: string;
};

export type AuthSessionSnapshot = {
  accessToken: string;
  accountId: number;
  role: AuthSessionRole;
  userInfo: AuthSessionUserSummary | null;
};

export type EstablishAuthSessionInput = AuthSessionSnapshot;

export type AuthSessionState =
  | {
      session: null;
      status: 'anonymous';
    }
  | {
      session: AuthSessionSnapshot;
      status: 'authenticated';
    };

export type AuthSessionPersistence = {
  clear: () => void;
  read: () => AuthSessionSnapshot | null;
  write: (session: AuthSessionSnapshot) => void;
};

/**
 * 不含 Token 的窄会话身份：accountId 标识「谁」，epoch 标识「哪一个会话生命周期」。
 * 会话建立（登录）、恢复（刷新后重建）、清除（登出 / 失效）都推进代次，同一账号
 * 退出后重新登录会得到不同代次；会话内的昵称回写不推进。供改密等动作在**请求
 * 发起前**采样固化身份，迟到响应由 store 与当前会话比对裁决。
 */
export type AuthSessionIdentity = {
  accountId: number;
  epoch: number;
};

export type AuthSessionView = Omit<AuthSessionSnapshot, 'accessToken'>;

export type AuthSessionViewState =
  | {
      session: null;
      status: 'anonymous';
    }
  | {
      session: AuthSessionView;
      status: 'authenticated';
    };
