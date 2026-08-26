import type {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginHistoryItemModel,
} from '@app-types/models/account.types';
import type { Gender, GeographicInfo, UserState } from '@app-types/models/user-info.types';

/** 账户创建写入数据（普通 data shape，不含 ORM Entity） */
export interface AccountCreateData {
  loginName?: string | null;
  loginEmail?: string | null;
  loginPassword?: string;
  status?: AccountStatus;
  audience?: AudienceTypeEnum;
  identityHint?: string | null;
  recentLoginHistory?: LoginHistoryItemModel[] | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 账户更新写入数据：仅开放当前业务需要的字段，避免 Entity 形状外泄 */
export interface AccountUpdateData {
  status?: AccountStatus;
  identityHint?: string | null;
}

/** 用户信息创建写入数据（普通 data shape，不含 ORM Entity） */
export interface UserInfoCreateData {
  accountId?: number;
  nickname?: string;
  gender?: Gender;
  birthDate?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  signature?: string | null;
  accessGroup?: IdentityTypeEnum[];
  address?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  geographic?: GeographicInfo | null;
  metaDigest?: IdentityTypeEnum[] | null;
  notifyCount?: number;
  unreadCount?: number;
  userState?: UserState;
  createdAt?: Date;
  updatedAt?: Date;
}

/** 用户信息更新写入数据（普通 data shape，不含 ORM Entity） */
export interface UserInfoUpdateData {
  nickname?: string;
  gender?: Gender;
  birthDate?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  signature?: string | null;
  address?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  geographic?: GeographicInfo | null;
  notifyCount?: number;
  unreadCount?: number;
  userState?: UserState;
}

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
