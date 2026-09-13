// src/modules/account/base/services/account.service.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  AccountStatus,
  AudienceTypeEnum,
  IdentityTypeEnum,
  LoginHistoryItemModel,
} from '@app-types/models/account.types';
import { Gender, type GeographicInfo, UserState } from '@app-types/models/user-info.types';
import {
  ACCOUNT_ERROR,
  ADMIN_USER_ERROR,
  AUTH_ERROR,
  DomainError,
} from '@core/common/errors/domain-error';
import { LegacyPasswordCryptoHelper } from '@modules/common/password/legacy-password-crypto.helper';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getTypeOrmEntityManager } from '@src/infrastructure/database/transaction/typeorm-persistence-transaction-context';
import type { AccountCreateOutcome } from '@src/modules/account/account.types';
import { QueryFailedError, Repository } from 'typeorm';

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
  /** `base_user_info.company_name`（varchar(100) nullable）：既有列，本轮只补齐创建数据入口 */
  companyName?: string | null;
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
  /**
   * 必填：所有新建 UserInfo 的生产入口必须显式提供，不依赖 Entity 列默认值
   * （`base_user_info.user_state` 列默认 `PENDING`，静默默认值会让新建账号
   *  落成 ACTIVE / PENDING 的不一致状态）。由 `CreateAccountUsecase` 做
   * 账号状态与用户状态的一致性校验，BANNED / DELETED 无对应 UserState，失败关闭。
   */
  userState: UserState;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserInfoUpdateData {
  nickname?: string;
  /** `base_user_info.company_name`（varchar(100) nullable）：既有列，P0-4 补齐细粒度更新入口 */
  companyName?: string | null;
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

  /**
   * 管理员创建普通用户：插入账号行，并把数据库唯一索引冲突收敛为稳定事实。
   *
   * 为什么不复用 `saveAccount()`：该方法返回 `AccountEntity`（`usecase.rules.md` 禁止 Usecase
   * import 或短暂持有 ORM Entity），且不识别唯一索引冲突；改造它会连带改变注册链路与
   * 因此新增本方法，只服务管理员创建场景，`saveAccount()` 原样保留。
   *
   * 唯一索引冲突（`uk_login_name` / `uk_login_email`）是**预期业务结果**而非故障：
   * 采用「返回事实对象而不抛错」的 precedent：`RepairRequestService.softDeleteRequest()`。
   *
   * 其余数据库异常在 ORM/modules 边界收敛为 `ADMIN_USER_ERROR.WRITE_FAILED`
   * （对外 `INTERNAL_SERVER_ERROR`），不把 TypeORM / MySQL 异常直接泄漏给 Resolver：
   * 驱动错误文本可能含 SQL、表名与索引名，一律不进 `details`，仅以 `cause` 在内部保留
   * （全局 GraphQL 过滤器只把 `details` 写入 `extensions`，不序列化 `cause`）。
   *
   * 会被用作密码哈希的时间盐（`hashPasswordWithTimestamp()` 取 `createdAt.toISOString()`），
   * 而登录校验时读的是库中 `created_at` 列，两者必须同源。当前的同源保证来自
   * **调用方显式传入 `createdAt`**：唯一调用方 `AdminCreateUserUsecase` 传了 `new Date()`，
   * 而 TypeORM 1.0 的 `@CreateDateColumn` 自动填充分支已被注释掉（`InsertQueryBuilder` 与
   * `SubjectChangedColumnsComputer` 内），显式值就是被 INSERT 持久化的值 ⇒
   * `saved.createdAt` 与库中值同源，**无论 `SaveOptions.reload` 开启与否都成立**。
   *
   * 因此不再声称「关闭 reload 必然导致所有经本方法创建的账号无法登录」——对当前
   * 调用方该结论**不成立**：关闭 reload 只会让 `saved.createdAt` 取自内存而非回读，
   * 而两者本就是同一个应用时间值。真正的硬约束是：`AccountCreateData.createdAt` 是
   * **可选**字段，一旦有调用方省略它，INSERT 会落到列默认 `CURRENT_TIMESTAMP(3)`
   * （数据库时钟），内存实体不含该值，此时**只有 reload 能取回它**；若同时关闭 reload，
   * `saved.createdAt` 将为 `undefined`，盐值与登录校验读取的库中值不一致 ⇒ 该账号无法登录。
   * 修改本方法的 save 选项、返回结构或 `createdAt` 的可选性之前，必须确认「调用方显式传值」
   * 与「reload 默认开启」两个前提至少一个仍然成立，并同步验证注册与登录链路。
   */
  async insertAccount(params: {
    accountData: AccountCreateData;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<AccountCreateOutcome> {
    const repository = this.getAccountRepository(params.transactionContext);
    try {
      const saved = await repository.save(repository.create(params.accountData));
      return { kind: 'CREATED', accountId: saved.id, createdAt: saved.createdAt };
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        return { kind: 'CREDENTIAL_CONFLICT' };
      }
      throw new DomainError(
        ADMIN_USER_ERROR.WRITE_FAILED,
        '用户账号创建失败，请稍后重试',
        undefined,
        error,
      );
    }
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

  /**
   * 管理员创建普通用户：插入资料行（`create` + `save` 合并，Entity 不出本 Service）。
   *
   * 与 `insertAccount()` 同构的插入入口：调用方只传纯数据，`UserInfoEntity` 的构造与
   * 持久化全部在本方法内完成，Usecase 因此不短暂持有 ORM Entity
   *
   * 为什么不改造 `createUserInfoEntity()` + `saveUserInfo()` 两步组合：该组合是既有公开
   * 接口，`WeappRegisterUsecase` 与 `UpdateVisibleUserInfoUsecase` 仍在使用，改造会连带
   *
   * `meta_digest` 由 `FieldEncryptionSubscriber.beforeInsert` 自动加密，调用方只传数组明文。
   * 数据库异常不在本方法收敛：与 `saveUserInfo()` 保持一致，由调用方 Usecase 在事务边界
   */
  async insertUserInfo(params: {
    userInfoData: UserInfoCreateData;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<void> {
    const repository = this.getUserInfoRepository(params.transactionContext);
    await repository.save(repository.create(params.userInfoData));
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

  /**
   * 唯一约束冲突判定（MySQL：`ER_DUP_ENTRY` / errno 1062 / SQLSTATE 23000）。
   *
   * 判定口径与仓库既有实现完全一致（`RepairRequestService`、`VerificationRecordService`、
   * `AsyncTaskRecordService`、`AiWorkflowContextService`、`AiProviderCallRecordService`）：
   * 优先读 TypeORM 的 `driverError`，缺失时回退直接读 error 对象。
   * 本仓当前没有共享 helper，抽取公共实现需同时改动上述 5 个不相关服务，超出本轮范围，
   */
  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const errorObj = error as unknown as Record<string, unknown>;

    const driverError = errorObj.driverError as Record<string, unknown> | undefined;
    if (
      driverError &&
      (driverError.code === 'ER_DUP_ENTRY' ||
        driverError.errno === 1062 ||
        driverError.sqlState === '23000')
    ) {
      return true;
    }

    // 兼容性回退：driverError 缺失时直接读取 error 对象
    return (
      errorObj.code === 'ER_DUP_ENTRY' || errorObj.errno === 1062 || errorObj.sqlState === '23000'
    );
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
