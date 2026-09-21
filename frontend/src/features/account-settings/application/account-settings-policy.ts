// src/features/account-settings/application/account-settings-policy.ts

/**
 * 登录名策略的 feature 本地镜像：真源是 backend/src/core/account/policy/login-name.policy.ts
 * （最少 4 字符、最多 30 字符、只允许英文字母 / 数字 / 下划线 / 短横线）。
 *
 * 为什么本地镜像：features 之间禁止互相引用，不能复用 admin-user-management 的同名常量；
 * admin 切片先例（admin-user-management-policy.ts）同样以本地常量镜像后端策略。
 * 后端仍是策略唯一真源与最终裁决（协议级 DTO 校验 + usecase normalize），前端镜像
 * 只用于提交前给出即时、可行动的格式提示——生产环境下后端 DTO 校验细节会被
 * graphql-exception.filter 收敛（code 强制 INTERNAL_SERVER_ERROR、不透传 errorMessage），
 * 不做客户端校验时用户只能看到「操作失败，请稍后重试」。数值漂移由后端裁决兜底。
 */

export const ACCOUNT_LOGIN_NAME_MIN_LENGTH = 4;

export const ACCOUNT_LOGIN_NAME_MAX_LENGTH = 30;

/** 与后端 LOGIN_NAME_PATTERN 同源：只允许英文字母、数字、下划线、短横线 */
export const ACCOUNT_LOGIN_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const ACCOUNT_LOGIN_NAME_RULE_MESSAGE = `登录名需为 ${ACCOUNT_LOGIN_NAME_MIN_LENGTH}~${ACCOUNT_LOGIN_NAME_MAX_LENGTH} 个字符，只允许英文字母、数字、下划线和短横线`;
