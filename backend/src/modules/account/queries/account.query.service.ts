// src/modules/account/queries/account.query.service.ts
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  IdentityTypeEnum,
  ThirdPartyProviderEnum,
  UserAccountView,
} from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { UsecaseSession } from '@app-types/auth/session.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { canViewUserInfo } from '@core/account/policy/user-info-visibility.policy';
import { ACCOUNT_ERROR } from '@core/common/errors';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { normalizeEmail } from '@core/common/normalize/normalize.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { Repository, In } from 'typeorm';
import type {
  AccountCredentialSnapshot,
  AccountLoginBootstrapSnapshot,
  AccountSessionAuthoritySnapshot,
  AccountSnapshot,
} from '../account.types';
import { AccountEntity } from '../base/entities/account.entity';
import { UserInfoEntity } from '../base/entities/user-info.entity';

export type VisibleDetailMode = 'BASIC' | 'FULL';

/**
 * 把实体上的角色数组原值转为快照值（`AccountSessionAuthoritySnapshot` 的字段口径）。
 *
 * - 数组：显式拷贝（`[...]`），断开 ORM 实体别名，避免消费方的原地修改被 TypeORM
 *   脏检查持久化（该类型注释的强制要求）；
 * - 非数组：**原样透传**，不做补全、猜测或修复——`meta_digest` 实际是 varchar(1024)
 *   加密列，解密失败时水合会保留密文字符串（遗留数据可能不是数组），运行时形状的
 *   裁决统一由消费方的三源收敛纯函数失败关闭；此处仅把非空原值收窄为声明类型
 *   以通过编译，不改变任何运行时语义。
 */
const toRoleArraySnapshot = (value: unknown): ReadonlyArray<IdentityTypeEnum> | null => {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return value as ReadonlyArray<IdentityTypeEnum>;
  return Array.from(value as ReadonlyArray<IdentityTypeEnum>);
};

@Injectable()
export class AccountQueryService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserInfoEntity)
    private readonly userInfoRepository: Repository<UserInfoEntity>,
  ) {}

  async getAccountById(params: {
    session: UsecaseSession;
    targetAccountId: number;
  }): Promise<UserAccountView> {
    const { session, targetAccountId } = params;

    if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '非法的目标账户 ID');
    }

    const allowed = this.isAllowedToViewAccountDetail(session, targetAccountId);
    if (!allowed) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限查看该账户信息');
    }

    const account = await this.accountRepository.findOne({ where: { id: targetAccountId } });
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    return this.toUserAccountView(account);
  }

  async findAccountSnapshotById(params: {
    accountId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<AccountSnapshot | null> {
    const accountRepository = this.getAccountRepository(params.transactionContext);
    const account = await accountRepository.findOne({ where: { id: params.accountId } });
    return account ? this.toUserAccountView(account) : null;
  }

  async getUserAccountViewById(params: {
    accountId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<UserAccountView> {
    const account = await this.findAccountSnapshotById(params);
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }
    return account;
  }

  /**
   * 受保护请求的账号权限事实快照（P0-7，单一语义读取，query-side projection）。
   *
   * 为 `ValidateAccessTokenSessionUsecase` 提供数据库当前授权事实，用于把
   * 「Token 签发时的声明」与「请求时的数据库事实」比对。形状与缺失语义见
   * `AccountSessionAuthoritySnapshot`：
   * - 账号行缺失 → `accountStatus: null` 且 `identityHint: null`、`userInfo: null`；
   *   资料行缺失 → 仅 `userInfo: null`（结构上不可漏判）；缺失不在此抛错，
   *   错误口径（失败关闭为 `UNAUTHENTICATED`）归调用方 Usecase；
   * - `identityHint` 是账号侧列（`base_user_account.identity_hint`）；
   *   `accessGroup` / `metaDigest` 按数据库原值透传（经 `toRoleArraySnapshot()`），
   *   不做任何补全或修复。
   *
   * 刻意走 entity 水合路径（`findOne` + relation）：`meta_digest` 是加密列，只有
   * 水合路径（`FieldEncryptionSubscriber.afterLoad`）才解密并 `JSON.parse`；与
   * `AdminUserQueryService` 文件头的「必须走 entity 水合路径、禁止 `getRawMany()`」
   * 强制约束同源，不新增第二套绕过订阅者的查询路径。
   *
   * 不接受事务上下文：JWT 校验发生在每个受保护请求的认证阶段，不在任何事务内，
   * 读到的就是请求时刻的已提交事实。
   *
   * 快照仅供服务端内部复核，任何字段（尤其 `metaDigest`）不得经 View / DTO 外泄
   * （`AccountSessionAuthoritySnapshot` 注释）。数据库异常按既有链路冒泡，不在本方法
   * 包装改写：数据库不可用不是「会话无效」。
   *
   * @returns 快照；账号行缺失时返回缺省事实（不返回 `null`，由调用方统一判字段）。
   */
  async findSessionAuthoritySnapshot(params: {
    accountId: number;
  }): Promise<AccountSessionAuthoritySnapshot> {
    const account = await this.accountRepository.findOne({
      where: { id: params.accountId },
      relations: { userInfo: true },
    });

    if (!account) {
      return {
        accountId: params.accountId,
        accountStatus: null,
        identityHint: null,
        userInfo: null,
      };
    }

    const userInfo = account.userInfo;
    return {
      accountId: account.id,
      accountStatus: account.status,
      identityHint: account.identityHint,
      userInfo: userInfo
        ? {
            userState: userInfo.userState,
            accessGroup: toRoleArraySnapshot(userInfo.accessGroup),
            metaDigest: toRoleArraySnapshot(userInfo.metaDigest),
          }
        : null,
    };
  }

  async findCredentialByLoginName(params: {
    loginName: string;
  }): Promise<AccountCredentialSnapshot | null> {
    const normalizedLoginName = normalizeEmail(params.loginName);
    const account = await this.accountRepository
      .createQueryBuilder('account')
      .where('account.loginName = :loginName', { loginName: params.loginName })
      .orWhere('account.loginEmail = :loginEmail', { loginEmail: normalizedLoginName })
      .getOne();
    if (!account) {
      return null;
    }
    return {
      id: account.id,
      status: account.status,
      loginPassword: account.loginPassword,
      createdAt: account.createdAt,
    };
  }

  async checkAccountExists(params: {
    loginName?: string | null;
    loginEmail: string;
  }): Promise<boolean> {
    const query = this.accountRepository
      .createQueryBuilder('account')
      .where('account.loginEmail = :loginEmail', { loginEmail: normalizeEmail(params.loginEmail) });
    if (params.loginName) {
      query.orWhere('account.loginName = :loginName', { loginName: params.loginName });
    }
    const count = await query.getCount();
    return count > 0;
  }

  async checkNicknameExists(nickname: string): Promise<boolean> {
    const userInfo = await this.userInfoRepository.findOne({ where: { nickname } });
    return !!userInfo;
  }

  /**
   * 按账号 ID 批量读取安全昵称（只读公开显示名，不含敏感字段）。
   * 供其他域读模型跨域富集展示昵称（负责人 20260901 裁定 3：不存快照，读时关联）；
   * 缺失/空白昵称不进入结果，由调用方决定回落展示。
   */
  async findNicknamesByAccountIds(accountIds: ReadonlyArray<number>): Promise<Map<number, string>> {
    const uniqueIds = [...new Set(accountIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const rows = await this.userInfoRepository.find({
      where: { accountId: In(uniqueIds) },
      select: { accountId: true, nickname: true },
    });
    const nicknames = new Map<number, string>();
    for (const row of rows) {
      const trimmed = row.nickname?.trim();
      if (trimmed) {
        nicknames.set(row.accountId, trimmed);
      }
    }
    return nicknames;
  }

  async pickAvailableNickname(params: {
    providedNickname?: string;
    fallbackOptions?: ReadonlyArray<string>;
    provider?: ThirdPartyProviderEnum;
  }): Promise<string | undefined> {
    const candidates: string[] = [];
    if (params.providedNickname) {
      candidates.push(params.providedNickname);
    }

    for (const option of params.fallbackOptions ?? []) {
      const nickname = option.includes('@') ? option.split('@')[0] : option;
      if (nickname) {
        candidates.push(nickname);
      }
    }

    for (const candidate of candidates) {
      const exists = await this.checkNicknameExists(candidate);
      if (!exists) {
        return candidate;
      }

      const uniqueNickname = await this.generateUniqueNicknameWithSuffix(candidate);
      if (uniqueNickname) {
        return uniqueNickname;
      }
    }

    if (!params.provider) {
      return undefined;
    }

    const fallbackBase = this.getFallbackNicknameByProvider(params.provider);
    const fallbackNickname = await this.generateUniqueNicknameWithSuffix(fallbackBase);
    if (fallbackNickname) {
      return fallbackNickname;
    }

    const randomSuffix = this.generateRandomString(12);
    return `${fallbackBase}#${randomSuffix}`;
  }

  toUserAccountView(account: AccountEntity): UserAccountView {
    return {
      id: account.id,
      loginName: account.loginName,
      loginEmail: account.loginEmail,
      status: account.status,
      identityHint: account.identityHint,
      recentLoginHistory: account.recentLoginHistory || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  async getVisibleUserInfo(params: {
    session: UsecaseSession;
    targetAccountId: number;
    detail?: VisibleDetailMode;
  }): Promise<UserInfoView> {
    const { session, targetAccountId } = params;
    const detail: VisibleDetailMode = params.detail ?? 'FULL';

    if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '非法的目标账户 ID');
    }

    const allowed = this.isAllowedToView(session, targetAccountId);
    if (!allowed) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限查看该用户信息');
    }

    const view = await this.getUserInfoViewStrict({ accountId: targetAccountId });

    if (detail === 'BASIC') {
      return this.maskToBasic(view);
    }
    return view;
  }

  async getLoginBootstrapSnapshot(params: {
    accountId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<AccountLoginBootstrapSnapshot> {
    const accountRepository = this.getAccountRepository(params.transactionContext);
    const account = await accountRepository.findOne({ where: { id: params.accountId } });
    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    const userInfo = await this.findUserInfoByAccountId(
      params.accountId,
      params.transactionContext,
    );
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    return {
      account: {
        id: account.id,
        loginName: account.loginName,
        loginEmail: account.loginEmail,
        status: account.status,
        identityHint: account.identityHint,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
      userInfo: {
        id: userInfo.id,
        accountId: userInfo.accountId,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl,
        accessGroup: userInfo.accessGroup ?? null,
        metaDigest: userInfo.metaDigest ?? null,
        createdAt: userInfo.createdAt,
        updatedAt: userInfo.updatedAt,
      },
    };
  }

  async getUserInfoViewStrict(params: {
    accountId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<
    UserInfoView & {
      nickname: string;
      userState: UserState;
      notifyCount: number;
      unreadCount: number;
      createdAt: Date;
      updatedAt: Date;
    }
  > {
    const { accountId } = params;

    const base = await this.findUserInfoByAccountId(accountId, params.transactionContext);
    if (!base) {
      throw new DomainError(
        ACCOUNT_ERROR.USER_INFO_NOT_FOUND,
        `账户 ID ${accountId} 对应的用户信息不存在，无法完成操作`,
      );
    }

    const finalAccessGroup: IdentityTypeEnum[] = base.accessGroup?.length
      ? base.accessGroup
      : [IdentityTypeEnum.CUSTOMER];

    return this.buildUserInfoView(base, accountId, finalAccessGroup);
  }

  async getUserInfoViewForLogin(params: { accountId: number }): Promise<UserInfoView> {
    const base = await this.findUserInfoByAccountId(params.accountId);
    const finalAccessGroup: IdentityTypeEnum[] = base?.accessGroup?.length
      ? base.accessGroup
      : [IdentityTypeEnum.CUSTOMER];

    return this.buildUserInfoView(base, params.accountId, finalAccessGroup);
  }

  private isAllowedToView(session: UsecaseSession, targetAccountId: number): boolean {
    const isSelf = session.accountId === targetAccountId;
    if (isSelf) return true;
    if (hasRole(session.roles, IdentityTypeEnum.SUPER_ADMIN)) return true;

    return canViewUserInfo(session.roles, { isSelf });
  }

  private isAllowedToViewAccountDetail(session: UsecaseSession, targetAccountId: number): boolean {
    const isSelf = session.accountId === targetAccountId;
    if (isSelf) return true;
    if (hasRole(session.roles, IdentityTypeEnum.SUPER_ADMIN)) return true;
    return false;
  }

  private buildUserInfoView(
    base: UserInfoEntity | null,
    accountId: number,
    accessGroup: IdentityTypeEnum[],
  ): UserInfoView {
    return {
      accountId,
      accessGroup,
      ...this.buildBasicFields(base),
      ...this.buildContactFields(base),
      ...this.buildExtendedFields(base),
      ...this.buildSystemFields(base),
    };
  }

  private buildBasicFields(base: UserInfoEntity | null) {
    return {
      nickname: base?.nickname ?? '',
      gender: base?.gender ?? Gender.SECRET,
      birthDate: base?.birthDate ?? null,
      avatarUrl: base?.avatarUrl ?? null,
      signature: base?.signature ?? null,
    };
  }

  private buildContactFields(base: UserInfoEntity | null) {
    return {
      email: base?.email ?? null,
      address: base?.address ?? null,
      phone: base?.phone ?? null,
    };
  }

  private buildExtendedFields(base: UserInfoEntity | null) {
    return {
      tags: this.normalizeTags(base?.tags),
      geographic: base?.geographic ?? null,
      metaDigest: base?.metaDigest ?? null,
    };
  }

  private buildSystemFields(base: UserInfoEntity | null) {
    return {
      notifyCount: base?.notifyCount ?? 0,
      unreadCount: base?.unreadCount ?? 0,
      userState: base?.userState ?? UserState.PENDING,
      createdAt: base?.createdAt ?? new Date(),
      updatedAt: base?.updatedAt ?? new Date(),
    };
  }

  private async findUserInfoByAccountId(
    accountId: number,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<UserInfoEntity | null> {
    const repository = this.getUserInfoRepository(transactionContext);
    return await repository.findOne({
      where: { accountId },
      relations: { account: true },
    });
  }

  private getAccountRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<AccountEntity> {
    return transactionContext
      ? getTypeOrmEntityManager(transactionContext).getRepository(AccountEntity)
      : this.accountRepository;
  }

  private getUserInfoRepository(
    transactionContext?: PersistenceTransactionContext,
  ): Repository<UserInfoEntity> {
    return transactionContext
      ? getTypeOrmEntityManager(transactionContext).getRepository(UserInfoEntity)
      : this.userInfoRepository;
  }

  private getFallbackNicknameByProvider(provider: ThirdPartyProviderEnum): string {
    switch (provider) {
      case ThirdPartyProviderEnum.WEAPP:
      case ThirdPartyProviderEnum.WECHAT:
        return '微信用户';
      case ThirdPartyProviderEnum.QQ:
        return 'QQ用户';
      case ThirdPartyProviderEnum.GOOGLE:
        return 'Google用户';
      case ThirdPartyProviderEnum.GITHUB:
        return 'GitHub用户';
      default:
        return '用户';
    }
  }

  private async generateUniqueNicknameWithSuffix(
    baseNickname: string,
  ): Promise<string | undefined> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomSuffix = this.generateRandomString(6);
      const uniqueNickname = `${baseNickname}#${randomSuffix}`;
      const exists = await this.checkNicknameExists(uniqueNickname);
      if (!exists) {
        return uniqueNickname;
      }
    }
    return undefined;
  }

  private generateRandomString(length: number): string {
    return Math.random()
      .toString(36)
      .substring(2, 2 + length);
  }

  private normalizeTags(tags: unknown): string[] | null {
    if (!tags) return null;
    if (Array.isArray(tags)) return tags.map((v) => String(v));
    return null;
  }

  private maskToBasic(view: UserInfoView): UserInfoView {
    return {
      accountId: view.accountId,
      nickname: view.nickname,
      gender: view.gender,
      birthDate: view.birthDate,
      avatarUrl: view.avatarUrl,
      email: null,
      signature: null,
      accessGroup: view.accessGroup,
      address: null,
      phone: view.phone,
      tags: null,
      geographic: null,
      metaDigest: null,
      notifyCount: 0,
      unreadCount: 0,
      userState: view.userState,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
