// src/usecases/account/admin-user-permission.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import type {
  AdminUserListRoleFilter,
  AdminUserListStatusFilter,
  AdminUserWritableRole,
  AdminUserWritableStatus,
} from '@src/modules/account/account.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';

/**
 * 管理员用户管理的角色与状态白名单（单一运行时真源）。
 *
 * 类型口径由 `src/modules/account/account.types.ts` 声明，本文件只持有运行时值域，
 * 供管理员场景的权限断言与输入规范化共同引用，避免各 Usecase 各写一份：
 * - `ADMIN_USER_WRITABLE_ROLES`：普通用户可写的单一业务角色，只接受 ENGINEER / CUSTOMER；
 * - `ADMIN_USER_LIST_ROLE_FILTERS`：列表查看筛选值域，额外允许 SUPER_ADMIN 只读展示；
 * - `ADMIN_USER_WRITABLE_STATUSES`：管理员可写账号状态，只接受 ACTIVE / INACTIVE；
 * - `ADMIN_USER_LIST_STATUS_FILTERS`：列表状态筛选值域，当前成员与可写状态相同，
 *   但刻意独立持有（与角色的读/写拆分对称）：读筛选值域与写入值域一旦共用同一数组，
 *   任何一侧的合理演进都会静默改变另一侧，属于授权面被动扩大。两份数组必须各自显式修改。
 *
 * 白名单属于业务授权决策，只存在于 Usecase 层；不得复制进 GraphQL DTO、Resolver
 * 或 modules(service)，也不得由前端策略代替（前端只控制展示，后端是权限真源）。
 *
 * 刻意不加 `Object.freeze`：`ReadonlyArray<T>` 提供编译期约束，而本仓对授权值域的既有
 * precedent（`core/account/policy/role-access.policy.ts` 的 `roleHierarchy`）同样只用 `Readonly<>`
 * 而未 freeze；`Object.freeze` 在本仓仅用于 `domain-error.ts` 的错误码表。单方面加固会与
 * 同层授权值域风格分裂，且无法防住「新增一份重复白名单」这类真正的漂移风险。
 */
export const ADMIN_USER_WRITABLE_ROLES: ReadonlyArray<AdminUserWritableRole> = [
  IdentityTypeEnum.ENGINEER,
  IdentityTypeEnum.CUSTOMER,
];

export const ADMIN_USER_LIST_ROLE_FILTERS: ReadonlyArray<AdminUserListRoleFilter> = [
  IdentityTypeEnum.SUPER_ADMIN,
  IdentityTypeEnum.ENGINEER,
  IdentityTypeEnum.CUSTOMER,
];

export const ADMIN_USER_WRITABLE_STATUSES: ReadonlyArray<AdminUserWritableStatus> = [
  AccountStatus.ACTIVE,
  AccountStatus.INACTIVE,
];

export const ADMIN_USER_LIST_STATUS_FILTERS: ReadonlyArray<AdminUserListStatusFilter> = [
  AccountStatus.ACTIVE,
  AccountStatus.INACTIVE,
];

/**
 * 管理员用户管理精确权限断言（列表、创建、资料编辑、状态修改、
 * 管理员重置密码等全部管理员用例的单一实现，不各写一份）。
 *
 * 业务规则：仅 roles 含 SUPER_ADMIN 且可信 JWT activeRole 精确为 SUPER_ADMIN 可执行。
 * 守卫层（RolesGuard + @Roles(SUPER_ADMIN)）只做入口粗粒度准入（按 accessGroup 判断），
 * 精确授权由每个管理员用例在使用处裁决，不依赖前端隐藏入口；
 * activeRole 缺失、与 roles 矛盾或为非管理员角色时一律拒绝（失败关闭）。
 * UsecaseSession.roles 已大写归一，直接精确匹配，不使用按角色继承展开的 hasRole，
 * 因此 ENGINEER / CUSTOMER 即使直接调用管理员 operation 也在此被拒绝。
 * 错误 details 不携带 accessGroup / 角色列表等身份信息，避免不必要的身份暴露。
 *
 * 错误口径：使用既有 `PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS`，
 * 由全局 GraphQL 异常过滤器映射为 `extensions.code === 'FORBIDDEN'`；
 * 未登录或 Session 失效不由本断言表达，继续由既有 JWT 认证链路映射为 `UNAUTHENTICATED`。
 * 动作文案由 `actionLabel` 拼进 `message`，因此拒绝响应与日志已能区分是哪个动作被拒；
 * `details` 刻意留空——全局过滤器会把 `details` 原样写入 `extensions.details`，
 * 再放一份动作名等于把同一信息暴露两次，而放入任何身份事实都会扩大信息面。
 *
 * **前置依赖（必须与本断言同时生效，本断言不含数据库复核）**：
 * 本断言只裁决可信 JWT 声明（`roles` / `activeRole`）。Token 在 `JWT_EXPIRES_IN` 内是静态的，
 * 因此仅靠本断言，一个已被停用或已降级的账号仍可在旧 Token 到期前继续执行创建、改角色、
 * 立即失效」直接冲突。该即时失效由 `ValidateAccessTokenSessionUsecase`（P0-7，`JwtStrategy`
 * 的唯一数据库 Session 复核入口）承担，二者必须同时生效，不得以本断言代替 P0-7。
 * `schema.graphql`（P0-8）；P0-2 ~ P0-6 用例 JSDoc 中的前置依赖标注随之生效完毕。
 *
 * @param session 当前会话身份快照
 * @param actionLabel 管理动作文案（如「查看」「创建」「停用」），仅用于拒绝提示
 */
export function assertAdminUserManagementPermission(
  session: UsecaseSession,
  actionLabel: string,
): void {
  const hasSuperAdminRole = session.roles.includes(IdentityTypeEnum.SUPER_ADMIN);
  const isActiveRoleSuperAdmin = session.activeRole === IdentityTypeEnum.SUPER_ADMIN;

  if (!hasSuperAdminRole || !isActiveRoleSuperAdmin) {
    throw new DomainError(
      PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
      `仅超级管理员账号可以${actionLabel}用户账号`,
    );
  }
}

/**
 * 管理员写目标角色保护断言：SUPER_ADMIN 账号在本功能内全部只读。
 *
 * - 不允许通过本功能创建、删除、降级、编辑资料、修改状态或重置 SUPER_ADMIN 密码；
 * - 由于所有 SUPER_ADMIN 均只读，任何针对管理员账号的写操作都在服务端统一拒绝，
 *   其中也包含「管理员停用自己」；
 * - 入参是目标账号已经收敛出的单一业务角色；目标角色数据缺失、矛盾或不能表达
 *   同一个唯一角色时，由调用方 Usecase 先行失败关闭，不把异常数据传入本断言；
 * - 判定按可写白名单正向匹配，未来新增角色默认不可写（失败关闭）。
 *
 * 错误口径：与管理员权限拒绝同为 `PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS`
 * （`FORBIDDEN`），不使用 `NOT_FOUND` 伪装管理员账号不存在。
 *
 * @param targetRole 目标账号当前的单一业务角色
 * @param actionLabel 管理动作文案（如「编辑资料」「修改状态」「重置密码」），仅用于拒绝提示
 */
export function assertWritableAdminUserTargetRole(
  targetRole: IdentityTypeEnum,
  actionLabel: string,
): void {
  const isWritableTargetRole = ADMIN_USER_WRITABLE_ROLES.some((role) => role === targetRole);

  if (!isWritableTargetRole) {
    throw new DomainError(
      PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
      `管理员账号只读，不可被${actionLabel}`,
    );
  }
}
