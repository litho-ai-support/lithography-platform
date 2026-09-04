// src/usecases/repair-request/engineer-write-permission.ts

import { UsecaseSession } from '@app-types/auth/session.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';

/**
 * 工程师精确写权限断言（接单 / 回复等工程师写用例的单一实现，不各写一份）
 *
 * 业务规则：仅 roles 含 ENGINEER 且可信 JWT activeRole 精确为 ENGINEER 可执行。
 * 守卫层（RolesGuard）只做入口粗粒度准入（按 accessGroup 判断），
 * 混合角色账号（如 SUPER_ADMIN + ENGINEER）以任一 activeRole 均可通过入口；
 * 精确写权限由各写用例在使用处裁决，不依赖前端隐藏按钮，
 * 也不改变守卫的读权限继承语义（读权限继承不等于写权限继承）。
 * activeRole 缺失或异常值一律拒绝（失败关闭）；UsecaseSession.roles 已大写归一，
 * 直接精确匹配，不使用按角色继承展开的 hasRole。
 * 错误 details 不携带 accessGroup/角色列表等身份信息，避免不必要的身份暴露。
 *
 * @param session 当前会话身份快照
 * @param actionLabel 写动作文案（如「接单」「回复」），仅用于拒绝提示
 */
export function assertEngineerWritePermission(session: UsecaseSession, actionLabel: string): void {
  const hasEngineerRole = session.roles.includes(IdentityTypeEnum.ENGINEER);
  const isActiveRoleEngineer = session.activeRole === IdentityTypeEnum.ENGINEER;

  if (!hasEngineerRole || !isActiveRoleEngineer) {
    throw new DomainError(
      PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS,
      `仅工程师账号可以${actionLabel}维修申请`,
    );
  }
}
