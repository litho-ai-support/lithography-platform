// 文件位置：src/core/account/policy/account-role-convergence.policy.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';

/**
 * 三源角色收敛的输入事实：**按来源列分组**，调用方直接把账号侧与资料侧的原始列值传入，
 * 由本 policy 负责判定，不在调用方预处理。
 *
 * 三个字段刻意声明为 `unknown`：
 * - `identity_hint` 是 `varchar(30)` 可空列，历史数据可能是 `null`、空串或非法枚举；
 * - `access_group` 是 `json` 列，TypeORM 水合后通常是数组，但历史数据可能是 `null` 或对象；
 * - `meta_digest` 是 `varchar(1024)` **加密列**（`AccountFieldEncryptionRegistrar` 注册
 *   `registerEncryptedField(UserInfoEntity, 'metaDigest')`），只有 entity 水合路径
 *   （`FieldEncryptionSubscriber.afterLoad` → `FieldEncryptionService.decryptEntity()`）才会解密
 *   并 `JSON.parse` 回数组；解密失败时会**保留密文字符串**。因此消费方必须保留 `Array.isArray`
 *   伪装成「摘要可用」，属于对异常数据的静默修复。
 */
export type AccountRoleConvergenceSource = {
  readonly identityHint: unknown;
  readonly accessGroup: unknown;
  readonly metaDigest: unknown;
};

/**
 * 收敛失败的原因分类：**仅供服务端定位与日志使用**。
 *
 * 严禁把它、把三源原值或把异常账号 ID 放进 `DomainError.details` 或 GraphQL `extensions`：
 * 而负责人已裁决异常角色数据「不向前端暴露异常账号 ID、三源角色原值或内部错误细节」。
 */
export type AccountRoleConvergenceFailureReason =
  | 'IDENTITY_HINT_MISSING'
  | 'IDENTITY_HINT_INVALID'
  | 'ACCESS_GROUP_NOT_ARRAY'
  | 'ACCESS_GROUP_EMPTY'
  | 'ACCESS_GROUP_MULTI_ROLE'
  | 'ACCESS_GROUP_INVALID_MEMBER'
  | 'META_DIGEST_MISSING'
  | 'META_DIGEST_NOT_ARRAY'
  | 'META_DIGEST_EMPTY'
  | 'META_DIGEST_MULTI_ROLE'
  | 'META_DIGEST_INVALID_MEMBER'
  | 'SOURCES_INCONSISTENT';

/**
 * 收敛结果：成功时给出**唯一**角色，失败时给出原因分类。
 *
 * 失败后的对外表达不同——P0-2 管理员列表要求失败关闭为通用 `INTERNAL_SERVER_ERROR`，
 * P0-7 受保护请求复核要求失败关闭为 `UNAUTHENTICATED`。若纯函数自己抛带错误码的异常，
 */
export type AccountRoleConvergenceResult =
  | { readonly converged: true; readonly role: IdentityTypeEnum }
  | { readonly converged: false; readonly reason: AccountRoleConvergenceFailureReason };

const IDENTITY_TYPE_VALUES: ReadonlyArray<string> = Object.values(IdentityTypeEnum);

const failed = (reason: AccountRoleConvergenceFailureReason): AccountRoleConvergenceResult => ({
  converged: false,
  reason,
});

/**
 * 严格判定单个来源列是否表达**恰好一个合法角色**。
 *
 * 不做任何宽容处理（刻意失败关闭）：
 * - 不做大小写归一：`expandRoles()` 会 `toUpperCase()` 后再匹配，那是「角色展开」场景的
 *   容错；这里判定的是**已持久化的授权事实**，把 `'engineer'` 当作 `ENGINEER` 等于静默修复
 *   异常数据，会让脏数据永远无法被发现；
 * - 不接受长度大于 1 的数组，即使成员去重后只有一个角色：写侧不变量要求 `access_group` 与
 * - 不接受空数组、`null`、`undefined`、空串与非数组。
 */
const readSingleRole = (value: unknown): IdentityTypeEnum | null => {
  if (typeof value !== 'string' || value.length === 0) return null;
  return IDENTITY_TYPE_VALUES.includes(value) ? (value as IdentityTypeEnum) : null;
};

const readSingleElementRoleArray = (
  value: unknown,
):
  | { readonly ok: true; readonly role: IdentityTypeEnum }
  | {
      readonly ok: false;
      readonly reason: 'NOT_ARRAY' | 'EMPTY' | 'MULTI_ROLE' | 'INVALID_MEMBER';
    } => {
  if (!Array.isArray(value)) return { ok: false, reason: 'NOT_ARRAY' };
  if (value.length === 0) return { ok: false, reason: 'EMPTY' };
  if (value.length > 1) return { ok: false, reason: 'MULTI_ROLE' };

  const role = readSingleRole(value[0]);
  if (role === null) return { ok: false, reason: 'INVALID_MEMBER' };
  return { ok: true, role };
};

/**
 * 把账号的三源角色事实收敛为**唯一**角色。
 *
 * 三源为 `base_user_account.identity_hint`、`base_user_info.access_group`、
 * `base_user_info.meta_digest`。收敛成功的充要条件是三者都表达**同一个**合法
 * `IdentityTypeEnum` 成员，且 `access_group` / `meta_digest` 都是单元素数组。
 * 因此普通用户只能收敛为单一 `ENGINEER` 或 `CUSTOMER`，存量管理员只能收敛为 `SUPER_ADMIN`；
 * 空数组、多角色、非法枚举、缺失摘要与三源不一致一律失败关闭。
 *
 * 本函数是**纯函数**：确定性、无 I/O、无 DI、无 ORM、无日志、不修改入参。
 * 生产调用方：`AdminUserQueryService`（P0-2 View 产出）；P0-7 受保护请求复核必须复用本实现。
 *
 * @param source 三源原始列值（按来源列分组，未预处理）
 * @returns 成功时 `{ converged: true, role }`；失败时 `{ converged: false, reason }`
 */
export function convergeAccountRole(
  source: AccountRoleConvergenceSource,
): AccountRoleConvergenceResult {
  const identityHint = source.identityHint;
  if (identityHint === null || identityHint === undefined || identityHint === '') {
    return failed('IDENTITY_HINT_MISSING');
  }

  const hintRole = readSingleRole(identityHint);
  if (hintRole === null) return failed('IDENTITY_HINT_INVALID');

  const accessGroup = readSingleElementRoleArray(source.accessGroup);
  if (!accessGroup.ok) return failed(`ACCESS_GROUP_${accessGroup.reason}`);

  if (source.metaDigest === null || source.metaDigest === undefined || source.metaDigest === '') {
    // `meta_digest` 是加密列，解密失败时 `decryptEntity()` 会保留密文字符串，
    // 只有「列本身缺失」才归为 MISSING；密文/非法 JSON 由下方 NOT_ARRAY 分支失败关闭
    return failed('META_DIGEST_MISSING');
  }

  const metaDigest = readSingleElementRoleArray(source.metaDigest);
  if (!metaDigest.ok) return failed(`META_DIGEST_${metaDigest.reason}`);

  if (hintRole !== accessGroup.role || hintRole !== metaDigest.role) {
    return failed('SOURCES_INCONSISTENT');
  }

  return { converged: true, role: hintRole };
}

/**
 * 历史会话角色集合校验：仅用于受保护请求的会话事实比对。
 *
 * 管理员写链路仍必须调用 `convergeAccountRole()`，维持其单角色三源一致性。
 * 此函数只兼容已有的合法多角色账号：两份角色数组必须是同一非空、无重复、合法角色集合，
 * 且 `identityHint` 必须属于该集合。
 */
export type AccountRoleSetValidationResult =
  | { readonly valid: true; readonly roles: readonly IdentityTypeEnum[] }
  | { readonly valid: false; readonly reason: string };

const readRoleSet = (
  value: unknown,
  source: 'ACCESS_GROUP' | 'META_DIGEST',
): AccountRoleSetValidationResult => {
  if (!Array.isArray(value)) return { valid: false, reason: `${source}_NOT_ARRAY` };
  if (value.length === 0) return { valid: false, reason: `${source}_EMPTY` };

  const roles: IdentityTypeEnum[] = [];
  for (const member of value) {
    const role = readSingleRole(member);
    if (role === null) return { valid: false, reason: `${source}_INVALID_MEMBER` };
    if (roles.includes(role)) return { valid: false, reason: `${source}_DUPLICATE_MEMBER` };
    roles.push(role);
  }
  return { valid: true, roles };
};

const hasSameRoleSet = (
  left: readonly IdentityTypeEnum[],
  right: readonly IdentityTypeEnum[],
): boolean => left.length === right.length && left.every((role) => right.includes(role));

export function validateAccountRoleSet(
  source: AccountRoleConvergenceSource,
): AccountRoleSetValidationResult {
  const identityHint = readSingleRole(source.identityHint);
  if (identityHint === null) return { valid: false, reason: 'IDENTITY_HINT_INVALID_OR_MISSING' };

  const accessGroup = readRoleSet(source.accessGroup, 'ACCESS_GROUP');
  if (!accessGroup.valid) return accessGroup;

  const metaDigest = readRoleSet(source.metaDigest, 'META_DIGEST');
  if (!metaDigest.valid) return metaDigest;

  if (!hasSameRoleSet(accessGroup.roles, metaDigest.roles)) {
    return { valid: false, reason: 'ROLE_SETS_INCONSISTENT' };
  }
  if (!accessGroup.roles.includes(identityHint)) {
    return { valid: false, reason: 'IDENTITY_HINT_NOT_IN_ROLE_SET' };
  }

  return { valid: true, roles: accessGroup.roles };
}
