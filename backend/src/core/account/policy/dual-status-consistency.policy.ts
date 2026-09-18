// 文件位置：src/core/account/policy/dual-status-consistency.policy.ts

import type { AccountStatus } from '@app-types/models/account.types';
import type { UserState } from '@app-types/models/user-info.types';

/**
 * 账号侧 `base_user_account.status` 与资料侧 `base_user_info.user_state` 双字段一致性的
 * **单一判定实现**（原 usecases 层 `admin-user-write-support.ts` 的本地 helper 上收至此）。
 *
 * `AccountStatus` 与 `UserState` 是两个不同枚举类型（成员字符串当前逐字相同），
 * 因此按字符串值显式比对，不做类型断言复用；将来任一枚举扩容导致成员不再逐字相同时，
 * 本判定自然转为「不一致」失败关闭，全部消费点同步收紧，不存在第二份会漂移的比对。
 *
 * 全部消费点必须经本函数，不得各写一份字符串比对：
 * - `AdminSetUserStatusUsecase`（P0-5 状态转换矩阵：双字段不一致即拒绝启用/停用）；
 * - `AdminResetUserPasswordUsecase`（P0-6 重置目标状态边界：双字段不一致即拒绝重置）；
 * - `AccountQueryService.toMyAccountSettingsSnapshot()`（P1 起自助设置读取的失败关闭判定）。
 *
 * 归属依据（`core.rules.md`：只有稳定且有生产调用点的规则才沉淀为 core policy）：
 * 该规则现有跨 usecases / modules 两层的多个生产调用点，与 `convergeAccountRole()` 同批沉淀；
 * modules 层不得反向依赖 usecases 层 helper，core 是双方都能依赖的唯一共享层
 * （`AccountQueryService` 已依赖同目录的 `convergeAccountRole()`，不引入新的依赖模式）。
 */
export function isDualStatusFieldsConsistent(params: {
  readonly accountStatus: AccountStatus;
  readonly userState: UserState;
}): boolean {
  return String(params.accountStatus) === String(params.userState);
}
