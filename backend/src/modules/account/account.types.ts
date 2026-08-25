import type {
  AccountStatus,
  IdentityTypeEnum,
  LoginHistoryItemModel,
} from '@app-types/models/account.types';

export interface AccountSnapshot {
  readonly id: number;
  readonly loginName: string | null;
  readonly loginEmail: string | null;
  readonly status: AccountStatus;
  readonly identityHint: string | null;
  readonly recentLoginHistory: LoginHistoryItemModel[] | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AccountCredentialSnapshot {
  readonly id: number;
  readonly status: AccountStatus;
  readonly loginPassword: string;
  readonly createdAt: Date;
}

export interface AccountSecurityUserInfoSnapshot {
  readonly accessGroup: IdentityTypeEnum[] | null;
  readonly metaDigest: IdentityTypeEnum[] | null;
}

export interface AccountSecuritySubjectSnapshot {
  readonly id: number;
  readonly userInfo: AccountSecurityUserInfoSnapshot;
}

export interface AccountLoginBootstrapSnapshot {
  readonly account: {
    readonly id: number;
    readonly loginName: string | null;
    readonly loginEmail: string | null;
    readonly status: AccountStatus;
    readonly identityHint: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly userInfo: {
    readonly id: number;
    readonly accountId: number;
    readonly nickname: string | null;
    readonly avatarUrl: string | null;
    readonly accessGroup: IdentityTypeEnum[] | null;
    readonly metaDigest: IdentityTypeEnum[] | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
}
