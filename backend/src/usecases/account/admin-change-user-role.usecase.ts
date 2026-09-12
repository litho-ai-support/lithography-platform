// src/usecases/account/admin-change-user-role.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { ADMIN_USER_ERROR, DomainError, isDomainError } from '@core/common/errors/domain-error';
import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserView, AdminUserWritableRole } from '@src/modules/account/account.types';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AdminUserQueryService } from '@src/modules/account/queries/admin-user.query.service';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import { PinoLogger } from 'nestjs-pino';
import {
  normalizeAdminUserTargetAccountId,
  normalizeAdminUserWritableRole,
} from './admin-user-management.input.normalize';
import type {
  AdminChangeUserRoleCommand,
  AdminChangeUserRoleOutcome,
} from './admin-user-management.types';
import { assertAdminUserManagementPermission } from './admin-user-permission';
import { loadWritableAdminUserTarget, logAdminUserWriteFailure } from './admin-user-write-support';

/** 事务内的写入阶段标记，只用于服务端日志定位，不出现在任何对外响应中。 */
type AdminChangeUserRolePhase = 'LOCK_TARGET' | 'WRITE_ROLE' | 'READ_BACK_VIEW';

/**
 * 管理员修改用户角色用例（P0-5）。
 *
 * 执行顺序刻意固定：
 * 1. **第一步就是精确 SUPER_ADMIN 权限断言**（`assertAdminUserManagementPermission()`，
 *    全仓唯一实现），先于任何输入规范化与数据库访问；
 * 2. 场景输入规范化：目标账号 ID + 单值可写角色（`ENGINEER` / `CUSTOMER`）；
 * 3. Usecase 持有的单一事务内：锁定目标 → 读取收敛 View → 目标角色保护 →
 *    三源一致性写入 → 回读 View 并校验后置条件。
 *
 * - `base_user_account.identity_hint` = 唯一角色（`AccountService.updateAccount()`）；
 * - `base_user_info.access_group` = 只含该角色的单元素数组、
 *   `base_user_info.meta_digest` = 同一个单元素数组
 *   （`AccountService.updateUserInfoAccessGroup()`，细粒度同步两源）；
 * 最终三处表达同一个唯一角色。前端只提交一个业务角色，不分别提交或拼装这三个字段。
 *
 * 数据库事实）；目标角色数据异常或不一致时失败关闭，不顺手修复历史数据。
 * 写入白名单（`normalizeAdminUserWritableRole()`）拒绝把 SUPER_ADMIN 作为新角色写入——
 * 两者不可互相替代：前者裁决「目标当前是不是只读管理员」，后者裁决「新角色是不是可写值」。
 *
 * 资料编辑与状态修改是各自独立用例。旧 Token 的失效由 P0-7 的公共受保护请求校验统一
 * 执行，本用例不直接操作 Session 或 JWT。
 *
 * 旧公共 `updateAccessGroup` 入口（`UpdateAccessGroupUsecase`）已无任何 GraphQL /
 * adapter 调用入口，仅作为内部遗留实现保留：它仍是一套独立的既有实现，**并未**
 * 委派本用例，保留自己的权限判定、输入规范化、事务边界与
 * `access_group` / `identity_hint` 两源写入，不消费本用例的任何内部结果；
 * `executeWithWriteOutcome()` 中的 `isUpdated` 语义是本用例自身的事务内事实
 * （目标角色已等于目标角色时零写入），并非旧入口映射。本用例是当前唯一公开的
 * GraphQL 角色写入口，旧入口仅为内部遗留实现保留，不在本用例内静默合并。
 *
 * 依赖方向：事务边界由本用例经 `TransactionRunner` 持有，同一个 `transactionContext`
 * 显式传给全部下游；只调用 modules 细粒度方法与 QueryService，不访问 Repository、
 * 不接触 ORM API、不持有 ORM Entity。
 *
 * 数据库复核。即时失效由 `ValidateAccessTokenSessionUsecase`（P0-7）承担。
 */
@Injectable()
export class AdminChangeUserRoleUsecase {
  constructor(
    private readonly accountService: AccountService,
    private readonly adminUserQueryService: AdminUserQueryService,
    private readonly logger: PinoLogger,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {
    this.logger.setContext(AdminChangeUserRoleUsecase.name);
  }

  async execute(command: AdminChangeUserRoleCommand): Promise<AdminUserView> {
    const { view } = await this.executeWithWriteOutcome(command);
    return view;
  }

  /**
   * 事务内角色写入 + 回读校验的完整结果：`view` 为稳定管理员视图，
   * `isUpdated` 表示本次是否发生真实角色写入（目标角色已等于目标值时零写入、
   * 返回 `false`）。`execute()` 只消费 `view`；该事实当前仅供本用例内部与
   * 测试消费，`UpdateAccessGroupUsecase` 并未接入（现状见类注释）。
   */
  async executeWithWriteOutcome(
    command: AdminChangeUserRoleCommand,
  ): Promise<AdminChangeUserRoleOutcome> {
    assertAdminUserManagementPermission(command.session, '修改角色');

    const accountId = normalizeAdminUserTargetAccountId(command.accountId);
    // 单值可写角色：SUPER_ADMIN、空值与非字符串（含数组形式的多角色）在此即被拒绝
    const role = normalizeAdminUserWritableRole(command.role);

    let outcome: AdminChangeUserRoleOutcome;
    try {
      outcome = await this.transactionRunner.run((transactionContext) =>
        this.changeRoleInTransaction({ transactionContext, accountId, role }),
      );
    } catch (error) {
      // 事务内各阶段的异常已由 changeRoleInTransaction 的 catch 记录日志并收敛为
      // DomainError；走到这里的非 DomainError 只可能来自事务边界本身
      // （BEGIN / COMMIT 失败都不经过内层 catch），统一收敛为 WRITE_FAILED。
      if (isDomainError(error)) {
        throw error;
      }
      logAdminUserWriteFailure({
        logger: this.logger,
        phase: 'TRANSACTION_BOUNDARY',
        error,
        summary: '管理员修改用户角色',
      });
      throw new DomainError(
        ADMIN_USER_ERROR.WRITE_FAILED,
        '修改用户角色失败，请稍后重试',
        undefined,
        error,
      );
    }

    // 成功日志在事务提交之后记录（同 AdminCreateUserUsecase 的假成功规避），
    // 只含账号主键与新角色：不含登录名、登录邮箱、昵称或任何凭据派生物。
    this.logger.info(
      { accountId: outcome.view.id, role: outcome.view.role },
      '管理员修改用户角色成功',
    );
    return outcome;
  }

  /**
   * 事务内的原子角色修改：三源一致写入与回读同成同败。
   *
   * 写入顺序刻意先账号侧后资料侧：`identity_hint` 先行、`access_group` / `meta_digest`
   * 由 `updateUserInfoAccessGroup()` 随后同步；两步在**同一事务**内，外部观察者只能看到
   * 全部生效或全部未生效的终态，不存在「两源新值、一源旧值」的可见中间态。
   *
   * 锁内收敛事实（`lockedView.role`），不依赖锁外过期快照参与决策；短路时不执行角色
   * UPDATE、不 bump `updated_at`，直接返回锁内安全 View 与 `isUpdated: false`。
   * 角色变化时时间列显式传应用时钟，与 P0-3 的显式时间语义同源。
   *
   * `convergeAccountRole()` 收敛出的单一角色（`lockedView.role`），**不单独检查
   * `access_group` / `meta_digest` 两源是否已同步到目标形态**。因此若历史数据已是
   * 「`access_group` 等于目标单元素数组、而 `meta_digest` 与之分叉」，该方法会返回
   * `isUpdated: false` 且不修复 `meta_digest`，本用例声称的「三处最终表达同一个唯一角色」
   * 就不成立。当前**不可达**：
   * `loadWritableAdminUserTarget()` 先经 `convergeAccountRole()` 失败关闭（分叉即
   * `SOURCES_INCONSISTENT` ⇒ `ROLE_DATA_INCONSISTENT`），此类行进不到写入；写后回读的
   * `view.role !== role` 是第二道拦截。若将来放宽三源收敛口径，或把该方法复用到无前置收敛
   * 的路径，必须同时补 `meta_digest` 比对，否则该保证会静默失效。
   *
   * 同理，`updateUserInfoAccessGroup()` 在资料行缺失时抛 `ACCOUNT_ERROR.USER_INFO_NOT_FOUND`
   * （过滤器映射 `NOT_FOUND`）：该分支在本路径同样不可达（资料行缺失已由前置
   * `toAdminUserView()` 失败关闭为 `READ_FAILED`，属系统侧故障而非「查无此人」），
   * 故本用例不为它单独设置错误码收敛。
   *
   * 已知死锁窗口与处置口径见 `admin-user-write-support.ts` 文件头。
   */
  private async changeRoleInTransaction(params: {
    transactionContext: PersistenceTransactionContext;
    accountId: number;
    role: AdminUserWritableRole;
  }): Promise<AdminChangeUserRoleOutcome> {
    const { transactionContext, accountId, role } = params;
    let phase: AdminChangeUserRolePhase = 'LOCK_TARGET';

    try {
      const lockedView = await loadWritableAdminUserTarget({
        accountService: this.accountService,
        adminUserQueryService: this.adminUserQueryService,
        accountId,
        actionLabel: '修改角色',
        transactionContext,
      });

      // 收敛事实）已等于目标角色时零写入——不执行角色 UPDATE、不 bump `updated_at`，
      // 直接返回锁内安全 View 与 `isUpdated: false`。基于锁内事实裁决，不依赖过期快照
      if (lockedView.role === role) {
        return { view: lockedView, isUpdated: false };
      }

      phase = 'WRITE_ROLE';
      // 账号侧唯一角色 + 显式 updatedAt（`updateAccount` 的 patch 由本用例逐字段构造，
      // 不透传任何调用方可控字段）
      await this.accountService.updateAccount(
        accountId,
        { identityHint: role, updatedAt: new Date() },
        transactionContext,
      );
      // 资料侧两源同步：access_group 与 meta_digest 一次写为同一个单元素数组，
      // meta_digest 由 FieldEncryptionSubscriber 在落库时自动加密
      await this.accountService.updateUserInfoAccessGroup({
        accountId,
        accessGroup: [role],
        transactionContext,
      });

      phase = 'READ_BACK_VIEW';
      const view = await this.adminUserQueryService.findAdminUserViewById({
        accountId,
        transactionContext,
      });
      if (view === null) {
        throw new DomainError(
          ADMIN_USER_ERROR.READ_FAILED,
          '用户角色更新后读取失败，请稍后重试',
          undefined,
          { diagnostic: 'UPDATED_ROLE_NOT_READABLE', accountId },
        );
      }
      // 后置校验：回读 View 的 role 由 convergeAccountRole() 重新收敛三源得出，
      // 必须精确等于本次请求的角色；不等说明写入未按预期落库，按系统侧失败关闭
      if (view.role !== role) {
        throw new DomainError(
          ADMIN_USER_ERROR.WRITE_FAILED,
          '用户角色更新失败，请稍后重试',
          undefined,
          { diagnostic: 'ROLE_NOT_REFLECTED_AFTER_WRITE', accountId },
        );
      }
      return { view, isUpdated: true };
    } catch (error) {
      logAdminUserWriteFailure({
        logger: this.logger,
        phase,
        error,
        summary: '管理员修改用户角色',
      });
      if (isDomainError(error)) {
        throw error;
      }
      throw new DomainError(
        ADMIN_USER_ERROR.WRITE_FAILED,
        '用户角色更新失败，请稍后重试',
        undefined,
        error,
      );
    }
  }
}
