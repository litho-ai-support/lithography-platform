// src/usecases/account/admin-user-write-support.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import {
  ACCOUNT_ERROR,
  ADMIN_USER_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
  isDomainError,
  PERMISSION_ERROR,
} from '@core/common/errors/domain-error';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';
import type { AdminUserStatusFacts, AdminUserView } from '@src/modules/account/account.types';
import { assertWritableAdminUserTargetRole } from './admin-user-permission';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { AdminUserQueryService } from '@src/modules/account/queries/admin-user.query.service';
import { PinoLogger } from 'nestjs-pino';

/**
 * 管理员用户写用例（P0-4 / P0-5 / P0-6）的共享执行支撑：
 * - `loadWritableAdminUserTarget()`：事务内锁定目标 + 读取收敛 View + 目标角色保护，
 *   写用例共用的单一实现（沿用 `admin-user-permission.ts` 在 P0-1 确立的「同一裁决
 * - `assertAdminUserPasswordPolicy()`：管理员创建初始密码与管理员重置密码共用的
 *   密码策略校验（P0-6 起入本文件，避免第二份策略断言）；
 * - `logAdminUserWriteFailure()`：P0-4 / P0-5 / P0-6 写用例的失败日志，脱敏与结构化诊断
 *
 * `extractDriverErrorCode()` 与 `errorMessage()` 两个取值 helper。「按阶段抑制 `message`」
 * 已于 P0-6 并入共享 helper——`logAdminUserWriteFailure()` 新增可选 `suppressMessagePhases`
 * 参数（缺省不抑制，既有调用方行为不变），P0-6 写哈希阶段的失败日志经类型化常量
 * `SUPPRESSED_MESSAGE_PHASES` 传入抑制清单。`AdminCreateUserUsecase.logCreateFailure()`
 * 仍保留「`UPDATE_PASSWORD_HASH` 阶段抑制 `message`」与「`CREDENTIAL_CONFLICT` 记 warn」
 * 两个创建路径特有分支，尚未合并的只剩后者——合并需给共享 helper 增加按错误码分流的
 *
 * `loadWritableAdminUserTarget()` 先取 `base_user_account` 的悲观行锁，各用例随后才写
 * `base_user_info`；依据是 `usecase-write-flow-boundaries.rules.md` 第 78-79 行「usecase 先开启
 * 事务，再显式调用 `lockByIdForUpdate(accountId, transactionContext)`」的表述，以及
 * `UpdateAccessGroupUsecase` 的既有同序实现。新增管理员写用例必须沿用本顺序，不得第三次分叉
 * （`UpdateVisibleUserInfoUsecase` 的既有现状例外见下方 R14 说明）。
 *
 * **R14 锁顺序说明（现状记录，非已完成收口）**：`UpdateVisibleUserInfoUsecase`（已发布的
 * `updateUserInfo` mutation）**尚未**复用 `loadWritableAdminUserTarget()`：它先经
 * `FetchUserInfoUsecase.executeStrict()` 读取并更新 userInfo，仅在需要更新 `identityHint`
 * 时才对 account 行取悲观锁；`identityHint` 也未在事务前禁止，仍保留锁内比对后单字段更新。
 * 因此「管理员写入口先锁 account 行再写 userInfo」的收口对该用例**尚未达成**，上述顺序目前
 * 只约束新增管理员写用例；若后续收口，应让该用例改走本文件共享实现，而不是在本文件外分叉。
 *
 * 本文件只被 `usecases/account` 内的写用例引用，不下沉 modules、不进 core：
 * 它编排的是 usecase 层的写流程步骤（锁、读、断言、日志），不是通用输入收敛。
 */

/**
 * 取异常文本；非 `Error` 值不参与日志，避免把未知形状的对象整体序列化。
 *
 * 实现。本轮只统一取值 helper，不统一失败日志的分流逻辑，理由见文件头。
 */
export const errorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : undefined;

/**
 * 取驱动错误的结构化错误码（MySQL 典型值：`errno` 数字 `1062` / `code` 字符串 `'ER_DUP_ENTRY'`）。
 *
 * TypeORM 1.0 的 `QueryFailedError` 以 `super(driverError.toString())` 构造，因此 `message` 是
 * **驱动错误文本**（形如 `ER_DUP_ENTRY: Duplicate entry 'x' for key 'uk_login_name'`），
 * **不含 SQL 文本**；SQL 在 `error.query`、绑定参数在 `error.parameters`，两者当前都不入日志。
 * 不取 `message` 的理由因此是：驱动文本可能内嵌冲突值与索引名，而错误码不含任何敏感数据，
 * 却足以区分故障类别（唯一索引冲突 / 连接中断 / 死锁）。
 *
 * 来源的异常（如 Node 的 `ERR_*`）也会出现在日志的 `driverCode` 字段里。该字段名只表达取值
 * 意图，不保证一定是数据库错误码；刻意不收窄为 `/^ER_/`——否则将来更换驱动或数据库时错误码
 * 会静默消失，排查面反而退化。
 *
 * 同时检查异常自身与 `driverError`：TypeORM 把原始驱动错误挂在 `driverError` 上，并用
 * `ObjectUtils.assign()` 把除 `name` 之外的驱动属性（含 `errno` / `code` / `sqlState`）复制到
 * `QueryFailedError` 自身，因此两处都可能读到。
 */
export const extractDriverErrorCode = (error: unknown): string | number | undefined => {
  if (!(error instanceof Error)) return undefined;
  const source = error as {
    driverError?: unknown;
    errno?: unknown;
    errNo?: unknown;
    code?: unknown;
  };
  for (const candidate of [source.driverError, source]) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const driver = candidate as { errno?: unknown; errNo?: unknown; code?: unknown };
    if (typeof driver.errno === 'number') return driver.errno;
    if (typeof driver.errNo === 'number') return driver.errNo;
    if (typeof driver.code === 'string') return driver.code;
  }
  return undefined;
};

/**
 * 事务内加载受保护的管理员写目标：锁定 → 读取收敛 View → 目标角色保护断言。
 *
 * 1. **先锁后读**：`AccountService.lockByIdForUpdate()` 持 `SELECT ... FOR UPDATE`
 *    悲观行锁，串行化针对同一目标账号的并发管理写；目标保护断言基于**锁内**读到的
 *    数据库事实，而不是锁前的过期快照；
 * 2. 锁内经 `findAdminUserViewById()` 读取收敛后的稳定 View：目标角色数据异常或不一致
 *    （`ROLE_DATA_INCONSISTENT`）、资料行缺失（`READ_FAILED`）由 `toAdminUserView()`
 *    统一失败关闭，本层不重复实现，也不顺手修复历史数据；
 * 3. `assertWritableAdminUserTargetRole()` 依数据库事实拒绝 SUPER_ADMIN 目标——
 *    SUPER_ADMIN 在本功能内全部只读，其中也包含「管理员操作自己」（自己的账号必然是
 *    SUPER_ADMIN）。
 *
 * 目标不存在时收敛为 `ADMIN_USER_ERROR.TARGET_NOT_FOUND`（过滤器映射 `NOT_FOUND`）：
 * **不得**沿用 `lockByIdForUpdate()` 原有的 `ACCOUNT_ERROR.ACCOUNT_NOT_FOUND` ——该码值
 * 与 `AUTH_ERROR.ACCOUNT_NOT_FOUND` 相同，会被过滤器映射为 `UNAUTHENTICATED`，违反
 * `graphql-error-contract-current.md`「not-found 不得塌缩为 UNAUTHENTICATED」的契约。
 *
 * @param params.accountService 锁能力由既有域内方法提供，本层不直接访问 ORM API
 * @param params.actionLabel 管理动作文案（如「编辑资料」「修改角色」「修改状态」），
 *   仅用于目标保护拒绝提示
 */
export async function loadWritableAdminUserTarget(params: {
  readonly accountService: AccountService;
  readonly adminUserQueryService: AdminUserQueryService;
  readonly accountId: number;
  readonly actionLabel: string;
  readonly transactionContext: PersistenceTransactionContext;
}): Promise<AdminUserView> {
  try {
    await params.accountService.lockByIdForUpdate(params.accountId, params.transactionContext);
  } catch (error) {
    if (isDomainError(error) && error.code === ACCOUNT_ERROR.ACCOUNT_NOT_FOUND) {
      throw new DomainError(ADMIN_USER_ERROR.TARGET_NOT_FOUND, '目标用户不存在');
    }
    throw error;
  }

  const view = await params.adminUserQueryService.findAdminUserViewById({
    accountId: params.accountId,
    transactionContext: params.transactionContext,
  });
  if (view === null) {
    // 锁定成功后账号仍读不到属系统侧故障（行锁不覆盖读写分离的复制路径等），失败关闭
    throw new DomainError(ADMIN_USER_ERROR.READ_FAILED, '用户账号读取失败，请稍后重试', undefined, {
      diagnostic: 'LOCKED_ACCOUNT_NOT_READABLE',
      accountId: params.accountId,
    });
  }

  assertWritableAdminUserTargetRole(view.role, params.actionLabel);
  return view;
}

/**
 *
 * - 非领域异常：记录异常类型名、驱动错误码与 `message`，供定位连接中断 / 死锁等
 *   基础设施故障；P0-4 / P0-5 写流程的语句不含密码派生物，记录 `message` 不引入敏感数据。
 *   **P0-6 例外**：管理员重置密码的写哈希阶段（`WRITE_PASSWORD_HASH`）的 UPDATE 语句
 *   绑定参数嵌新密码派生哈希，该阶段必须经 `suppressMessagePhases` 抑制 `message`
 *   （与 `AdminCreateUserUsecase.logCreateFailure()` 对 `UPDATE_PASSWORD_HASH` 阶段的
 *   纵深防御口径一致）；
 *   不是系统故障；
 * - 其余领域异常：记录错误码、阶段名与结构化 `cause.diagnostic`（如 `accountId` +
 *   `reason`），`cause` 为 `Error` 实例时丢弃 `message`，只保留类型名与驱动错误码。
 *
 * @param phase 事务内阶段标记（各用例自己的联合类型成员或 `'TRANSACTION_BOUNDARY'`），
 *   只用于服务端日志定位，不出现在任何对外响应中
 * @param summary 动作摘要（如「管理员编辑用户资料」），用于拼接日志消息
 * @param suppressMessagePhases 可选：命中这些阶段时抑制非领域异常的 `message` 字段
 *   （错误类型名与驱动错误码仍保留）。仅供写哈希等语句参数含密码派生物的阶段使用；
 *   缺省不抑制，既有 P0-4 / P0-5 调用者行为不变。
 */
export function logAdminUserWriteFailure(params: {
  readonly logger: PinoLogger;
  readonly phase: string;
  readonly error: unknown;
  readonly summary: string;
  readonly suppressMessagePhases?: ReadonlyArray<string>;
}): void {
  const { logger, phase, error, summary, suppressMessagePhases } = params;
  const suppressMessage = suppressMessagePhases?.includes(phase) ?? false;

  if (!isDomainError(error)) {
    const errorName = error instanceof Error ? error.name : 'UNKNOWN';
    logger.error(
      {
        reason: 'UNEXPECTED',
        phase,
        errorName,
        driverCode: extractDriverErrorCode(error),
        message: suppressMessage ? undefined : errorMessage(error),
      },
      `${summary}失败（非领域异常，已收敛为 WRITE_FAILED 上抛）`,
    );
    return;
  }

  if (
    error.code === ADMIN_USER_ERROR.TARGET_NOT_FOUND ||
    error.code === PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS ||
    // 或双字段不一致，属预期业务结果而非系统故障，与 CREDENTIAL_CONFLICT 记 warn 同口径
    error.code === ADMIN_USER_ERROR.STATUS_TRANSITION_NOT_ALLOWED ||
    // DELETED 或双字段不一致的账号重置密码，同为预期业务结果（warn），
    // 不记录密码 / 哈希 / Token / 角色原值
    error.code === ADMIN_USER_ERROR.PASSWORD_RESET_TARGET_STATUS_NOT_ALLOWED
  ) {
    logger.warn({ errorCode: error.code, phase }, `${summary}被拒绝，已按业务结果返回`);
    return;
  }

  const cause = error.cause;
  const diagnostic = cause instanceof Error || cause === undefined ? undefined : cause;
  logger.error(
    {
      errorCode: error.code,
      phase,
      diagnostic,
      causeErrorName: cause instanceof Error ? cause.name : undefined,
      driverCode: cause instanceof Error ? extractDriverErrorCode(cause) : undefined,
    },
    `${summary}失败`,
  );
}

/**
 * 管理员写用例的密码策略校验：复用全仓单一的 `PasswordPolicyService`，不另写强度规则。
 * 管理员创建普通用户（P0-3，初始密码）与管理员重置密码（P0-6，新密码）共用本实现，
 * 不各写一份。
 *
 * 失败抛 `INPUT_NORMALIZE_ERROR.INVALID_TEXT`（未入过滤器映射表 → 默认 `BAD_USER_INPUT`），
 * **不使用** `CreateAccountUsecase` 的 `AUTH_ERROR.INVALID_PASSWORD`：后者映射为
 * `UNAUTHENTICATED`，会让「管理员填了弱密码」被前端误判为会话失效并清理 Session 跳转登录页
 *
 * 先行校验后，`AccountService.hashPasswordWithTimestamp()` 内部 `preprocessPassword()` 的
 * `AUTH_ERROR.INVALID_PASSWORD` 分支对管理员路径不可达：两处判定同源（空/纯空白、NFKC 后
 * 首尾空白），能被策略层放行的密码必然也能通过预处理。
 *
 * 错误文案拼接 `validation.errors`，与 `RegisterWithEmailUsecase` / `CreateAccountUsecase`
 * 同源：管理员必须知道该改什么才能完成操作，而密码策略本身已经由公开注册入口对外暴露，
 * 拼接原因不构成额外信息泄露。`errors` 不含密码原文、黑名单具体条目与强度评分
 *
 * 调用方约束（`admin-user-management.input.normalize.ts` 文件头）：调用前必须已经过
 * `normalizeAdminUserPasswordInput()` 的非空断言；本函数只裁决强度，不重复判定存在性。
 *
 * @param params.fieldName 仅用于拒绝提示的字段名（如「初始密码」「新密码」）
 */
export function assertAdminUserPasswordPolicy(params: {
  readonly passwordPolicyService: PasswordPolicyService;
  readonly password: string;
  readonly fieldName: string;
}): void {
  const validation = params.passwordPolicyService.validatePassword(params.password);
  if (!validation.isValid) {
    throw new DomainError(
      INPUT_NORMALIZE_ERROR.INVALID_TEXT,
      `${params.fieldName}不符合安全要求: ${validation.errors.join(', ')}`,
    );
  }
}

/**
 * 是两个不同枚举类型（成员字符串当前逐字相同），一致性按字符串值显式比对。
 *
 * 消费方：`AdminSetUserStatusUsecase` 的状态转换矩阵（双字段不一致 ⇒ 拒绝启用/停用）
 * 与 `AdminResetUserPasswordUsecase` 的目标状态边界（双字段不一致 ⇒ 拒绝重置密码）。
 * 两处口径必须永远一致，故单一实现，不得各写一份；将来任一枚举扩容导致成员不再
 * 逐字相同时，本判定会自然转为「不一致」失败关闭。
 */
export function isDualStatusFieldsConsistent(facts: AdminUserStatusFacts): boolean {
  return String(facts.accountStatus) === String(facts.userState);
}
