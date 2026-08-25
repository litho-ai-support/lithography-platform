// src/modules/account/base/services/account.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginHistoryItemModel,
} from '@app-types/models/account.types';
import { Gender, type GeographicInfo, UserState } from '@app-types/models/user-info.types';
import { ACCOUNT_ERROR, AUTH_ERROR, DomainError } from '@core/common/errors/domain-error';
import { LegacyPasswordCryptoHelper } from '@modules/common/password/legacy-password-crypto.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import { Repository } from 'typeorm';

// ✅ base 层实体（始终存在）
import { AccountEntity } from '../entities/account.entity';
import { UserInfoEntity } from '../entities/user-info.entity';
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

@Injectable()
export class AccountService {
  constructor(
    // private readonly passwordHelper: PasswordPbkdf2Helper, // 移除这行
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserInfoEntity)
    private readonly userInfoRepository: Repository<UserInfoEntity>,
  ) {}

  // =========================================================
  // 登录历史 & 账户/用户信息（原样保留）
  // =========================================================

  /** 记录用户登录历史：保留最近 5 条（新记录 + 旧 4 条） */
  async recordLoginHistory(
    accountId: number,
    timestamp: string,
    ip?: string,
    audience?: string,
  ): Promise<void> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
      select: { recentLoginHistory: true },
    });

    const newHistoryItem: LoginHistoryItemModel = { ip: ip || '', timestamp, audience };
    const existingHistory = account?.recentLoginHistory || [];
    const updatedHistory: LoginHistoryItemModel[] = [
      newHistoryItem,
      ...existingHistory.slice(0, 4),
    ];

    await this.accountRepository.update(accountId, {
      recentLoginHistory: updatedHistory,
      updatedAt: new Date(),
    });
  }

  /** 创建账户实体（不落库） */
  createAccountEntity(params: {
    accountData: AccountCreateData;
    transactionContext?: PersistenceTransactionContext;
  }): AccountEntity {
    const { accountData, transactionContext } = params;
    const repository = this.getAccountRepository(transactionContext);
    return repository.create(accountData);
  }

  /** 落库账户实体 */
  async saveAccount(params: {
    account: AccountEntity;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<AccountEntity> {
    const { account, transactionContext } = params;
    const repository = this.getAccountRepository(transactionContext);
    return await repository.save(account);
  }

  /** 更新账户 */
  async updateAccount(
    id: number,
    updateData: Partial<AccountEntity>,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<void> {
    const repository = this.getAccountRepository(transactionContext);
    await repository.update(id, updateData);
  }

  async updateAccountPasswordHash(params: {
    accountId: number;
    passwordHash: string;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<void> {
    const repository = this.getAccountRepository(params.transactionContext);
    await repository.update(params.accountId, {
      loginPassword: params.passwordHash,
      updatedAt: new Date(),
    });
  }

  /**
   * 显式锁定账户以避免并发覆盖
   * @param accountId 账户 ID
   * @param transactionContext 事务上下文
   * @returns 锁定的账户实体
   */
  async lockByIdForUpdate(
    accountId: number,
    transactionContext: PersistenceTransactionContext,
  ): Promise<AccountEntity> {
    const repository = this.getAccountRepository(transactionContext);
    const account = await repository
      .createQueryBuilder('account')
      .where('account.id = :accountId', { accountId })
      .setLock('pessimistic_write')
      .getOne();

    if (!account) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_NOT_FOUND, '账户不存在');
    }

    return account;
  }

  /** 创建用户信息实体（不落库） */
  createUserInfoEntity(params: {
    userInfoData: UserInfoCreateData;
    transactionContext?: PersistenceTransactionContext;
  }): UserInfoEntity {
    const { userInfoData, transactionContext } = params;
    const repository = this.getUserInfoRepository(transactionContext);
    return repository.create(userInfoData);
  }

  /** 落库用户信息实体 */
  async saveUserInfo(params: {
    userInfo: UserInfoEntity;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<UserInfoEntity> {
    const { userInfo, transactionContext } = params;
    const repository = this.getUserInfoRepository(transactionContext);
    return await repository.save(userInfo);
  }

  async updateUserInfoFields(params: {
    accountId: number;
    patch: UserInfoUpdateData;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<void> {
    if (Object.keys(params.patch).length === 0) {
      return;
    }
    const repository = this.getUserInfoRepository(params.transactionContext);
    await repository.update(
      { accountId: params.accountId },
      {
        ...params.patch,
        updatedAt: new Date(),
      },
    );
  }

  /**
   * 更新用户 accessGroup 并同步 metaDigest
   */
  async updateUserInfoAccessGroup(params: {
    accountId: number;
    accessGroup: IdentityTypeEnum[];
    transactionContext: PersistenceTransactionContext;
  }): Promise<{ isUpdated: boolean }> {
    const { accountId, accessGroup, transactionContext } = params;
    const repository = this.getUserInfoRepository(transactionContext);
    const userInfo = await repository.findOne({ where: { accountId } });
    if (!userInfo) {
      throw new DomainError(ACCOUNT_ERROR.USER_INFO_NOT_FOUND, '用户信息不存在');
    }

    const current = userInfo.accessGroup ?? [];
    const isSame =
      current.length === accessGroup.length && current.every((v, i) => v === accessGroup[i]);
    if (isSame) {
      return { isUpdated: false };
    }

    userInfo.accessGroup = accessGroup;
    userInfo.metaDigest = accessGroup;
    userInfo.updatedAt = new Date();
    await repository.save(userInfo);
    return { isUpdated: true };
  }

  // =========================================================
  // 密码工具（原样保留）
  // =========================================================

  /** 使用创建时间的 UTC ISO 表示作为稳定盐值进行 PBKDF2 加密 */
  static hashPasswordWithTimestamp(password: string, createdAt: Date): string {
    // 应用与 PasswordPolicyService 相同的预处理
    const processedPassword = AccountService.preprocessPassword(password);
    const salt = createdAt.toISOString();
    return LegacyPasswordCryptoHelper.hashPasswordWithCrypto(processedPassword, salt);
  }

  /** 验证密码 */
  static verifyPassword(password: string, hashedPassword: string, createdAt: Date): boolean {
    // 应用与 PasswordPolicyService 相同的预处理
    const processedPassword = AccountService.preprocessPassword(password);
    const salt = createdAt.toISOString();
    return LegacyPasswordCryptoHelper.verifyPasswordWithCrypto(
      processedPassword,
      salt,
      hashedPassword,
    );
  }

  /**
   * 密码预处理 - 与 PasswordPolicyService 保持一致
   * @param password 原始密码
   * @returns 预处理后的密码
   */
  private static preprocessPassword(password: string): string {
    if (!password || /^\s*$/u.test(password)) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码不能为空或纯空白字符');
    }

    const normalizedPassword = password.normalize('NFKC');

    if (/^\s|\s$/u.test(normalizedPassword)) {
      throw new DomainError(AUTH_ERROR.INVALID_PASSWORD, '密码首尾不能包含空格');
    }

    return normalizedPassword;
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
}
