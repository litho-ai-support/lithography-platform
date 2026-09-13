// 文件位置：src/core/account/policy/login-name.policy.ts

/**
 *
 * 口径：最少 4 个字符、最多 30 个字符、只允许英文字母 / 数字 / 下划线 / 短横线；
 * 不执行大小写改写（`uk_login_name` 建在 `_ci` 排序列上，比较已大小写不敏感）；
 * 唯一性由数据库唯一索引 `uk_login_name` 兜底。
 *
 * 消费方（必须同源引用本文件，不得再各写字面，否则登录名规则漂移）：
 * - `RegisterInput.loginName`（注册入口，协议级 class-validator）：当前只复用
 *   最小长度与字符集；最大长度上限未在该入口声明（R12-11 Follow-up：补齐属于
 *   公共注册契约的行为变化，须负责人另行授权，超长登录名暂由数据库列宽兜底）；
 * - `AdminCreateUserInput.loginName`（管理员创建入口，协议级 class-validator）：
 *   最小长度、最大长度与字符集全部应用；
 * - `normalizeAdminUserLoginNameInput()`（管理员场景值收敛，usecase 层）：
 *   最小长度、最大长度与字符集全部应用。
 *
 * 已把该 DTO 定性为「未接入或语义不满足本任务的脚手架」；口径以实际注册入口与
 * 负责人确认的 4~30 为准。
 */
export const LOGIN_NAME_MIN_LENGTH = 4;

/** 登录名长度上限：`base_user_account.login_name` varchar(30) */
export const LOGIN_NAME_MAX_LENGTH = 30;

/** 登录名字符集：只允许英文字母、数字、下划线、短横线。 */
export const LOGIN_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
