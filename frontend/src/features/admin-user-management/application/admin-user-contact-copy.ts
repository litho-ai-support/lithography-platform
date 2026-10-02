// src/features/admin-user-management/application/admin-user-contact-copy.ts

/**
 * 「联系方式」区块的展示标签、复制文本与剪贴板写入契约。
 *
 * 字段全部取自列表查询**已经返回**的既有列（P0 结论）：登录邮箱 / 联系邮箱 / 电话对应
 * `AdminUserRow` 的 loginEmail / contactEmail / phone；复制文本只额外加入用户信息列已经在
 * 展示的用户名（nickname）与登录名（loginName）。不新增接口、不扩大权限，
 * 也不复制账号 ID、所属公司、角色与账号状态。
 */

import type { AdminUserRow } from './admin-user-management.types';

/**
 * 空值判定：null、空串或纯空白一律视为「无值」。
 * 展示层据此渲染占位符（不挂 Tooltip、不可聚焦），复制文本据此整行省略。
 */
export function normalizeAdminUserContactValue(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
}

/** 区块内的三行联系方式：标签 + 取值，顺序即列内展示顺序 */
export const ADMIN_USER_CONTACT_LINES: readonly {
  label: string;
  read: (row: AdminUserRow) => string | null;
}[] = [
  { label: '登录邮箱', read: (row) => row.loginEmail },
  { label: '联系邮箱', read: (row) => row.contactEmail },
  { label: '电话', read: (row) => row.phone },
];

function formatLine(label: string, value: string | null): string | null {
  const normalized = normalizeAdminUserContactValue(value);

  return normalized === null ? null : `${label}：${normalized}`;
}

/**
 * 复制文本：固定顺序 用户名 → 登录名 → 登录邮箱 → 联系邮箱 → 电话，空字段整行省略。
 */
export function buildAdminUserContactCopyText(row: AdminUserRow): string {
  return [
    formatLine('用户名', row.nickname),
    formatLine('登录名', row.loginName),
    ...ADMIN_USER_CONTACT_LINES.map((line) => formatLine(line.label, line.read(row))),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * 写入剪贴板。
 *
 * 剪贴板 API 缺失（非安全上下文、旧浏览器、测试环境未桩）或写入被拒绝/失败时一律返回
 * false，由调用方给出明确的失败提示——不静默当成功。
 */
export async function writeAdminUserContactCopyText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;

  if (typeof clipboard?.writeText !== 'function') {
    return false;
  }

  try {
    await clipboard.writeText(text);

    return true;
  } catch {
    return false;
  }
}
