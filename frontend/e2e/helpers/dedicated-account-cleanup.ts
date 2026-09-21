// e2e/helpers/dedicated-account-cleanup.ts
// 专用账号物理清理 helper（R3 修正轮）：真实改密用例经 adminCreateUser 创建的
// 一次性 ENGINEER 账号，在 finally 中按本次 accountId 精确删除该账号及全部关联记录。
//
// R3 改进要点：
// - 不再自建平行安全门，统一复用 real-backend.assertPhysicalCleanupAllowed()；
// - 使用独立 E2E 数据库（DB_NAME 必须含 e2e/test 段），环境不满足时在写入前 skip；
// - 单一事务包裹 8 条 DELETE + 残留核对，失败回滚；
// - 账号创建前完成权限 + 目标库 + 数据库连接预检。
//
// 安全边界：
// - 账号 ID 必须是安全正整数；SQL 仅按精确账号 ID 匹配（ai_message 经精确 conversation_id 子查询）；
// - FK 安全顺序（子表在前）→ mysql Query 内部加 START TRANSACTION / COMMIT，失败自动回滚；
// - 密码经 MYSQL_PWD 注入（real-backend.mysqlQuery 内部已处理），不出现在进程参数。

import { assertPhysicalCleanupAllowed, mysqlQuery, readBackendEnv } from './real-backend';

/**
 * 在任何专用账号写入之前完成清理授权、目标数据库和连接预检。
 * 物理删除授权统一复用 shared helper：必须显式 opt-in，且 DB_NAME 必须含 e2e/test 段。
 */
export function preflightDedicatedAccountCleanup(): void {
  const env = readBackendEnv();
  assertPhysicalCleanupAllowed(env);
  const actualDatabase = mysqlQuery('SELECT DATABASE()');
  if (actualDatabase !== env.DB_NAME) {
    throw new Error(
      `数据库连接目标不一致：配置为 ${JSON.stringify(env.DB_NAME)}，实际为 ${JSON.stringify(actualDatabase)}`,
    );
  }
}

/**
 * 按本次运行创建的专用账号 ID 物理删除该账号及全部关联记录（R3 修正轮）。
 *
 * 单一事务：START TRANSACTION → 子表到主表精确 DELETE → 残留核对 → COMMIT。
 * 任一步失败则 MySQL 自动回滚，不会半清理。
 */
export function deleteE2EDedicatedAccountById(accountId: number): void {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new Error(`物理清理目标账号 ID 未通过正整数校验，拒绝执行：${JSON.stringify(accountId)}`);
  }

  const env = readBackendEnv();
  assertPhysicalCleanupAllowed(env);

  const id = String(accountId);

  mysqlQuery(
    [
      'START TRANSACTION',
      `DELETE FROM engineer_response WHERE customer_account_id = ${id} OR engineer_account_id = ${id}`,
      `DELETE FROM ai_message WHERE conversation_id IN (SELECT id FROM ai_conversation WHERE engineer_account_id = ${id})`,
      `DELETE FROM ai_report WHERE engineer_account_id = ${id}`,
      `DELETE FROM ai_conversation WHERE engineer_account_id = ${id}`,
      `DELETE FROM repair_request WHERE customer_account_id = ${id} OR accepted_by_engineer_account_id = ${id}`,
      `DELETE FROM reference_document WHERE created_by_account_id = ${id}`,
      `DELETE FROM base_user_info WHERE account_id = ${id}`,
      `DELETE FROM base_user_account WHERE id = ${id}`,
      `SET @dedicated_cleanup_residue = (SELECT COUNT(*) FROM base_user_account WHERE id = ${id}) + (SELECT COUNT(*) FROM base_user_info WHERE account_id = ${id}) + (SELECT COUNT(*) FROM engineer_response WHERE customer_account_id = ${id} OR engineer_account_id = ${id}) + (SELECT COUNT(*) FROM ai_message WHERE conversation_id IN (SELECT id FROM ai_conversation WHERE engineer_account_id = ${id})) + (SELECT COUNT(*) FROM ai_report WHERE engineer_account_id = ${id}) + (SELECT COUNT(*) FROM ai_conversation WHERE engineer_account_id = ${id}) + (SELECT COUNT(*) FROM repair_request WHERE customer_account_id = ${id} OR accepted_by_engineer_account_id = ${id}) + (SELECT COUNT(*) FROM reference_document WHERE created_by_account_id = ${id})`,
      "SET @dedicated_cleanup_assertion = IF(@dedicated_cleanup_residue = 0, 'SELECT 1', 'SELECT dedicated_cleanup_residue_must_be_zero')",
      'PREPARE dedicated_cleanup_check FROM @dedicated_cleanup_assertion',
      'EXECUTE dedicated_cleanup_check',
      'DEALLOCATE PREPARE dedicated_cleanup_check',
      'COMMIT',
    ].join('; '),
  );
}

/** 精确统计主记录、userInfo 孤儿和已知关联业务表残留；这是只读核对。 */
export function readDedicatedAccountCleanupResidue(accountId: number): {
  account: number;
  relatedBusiness: number;
  userInfo: number;
} {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    throw new Error(`残留核对账号 ID 未通过正整数校验：${JSON.stringify(accountId)}`);
  }

  const id = String(accountId);
  // 三条语句：前两条单值 SELECT 以分号分隔；第三条是**一条完整**的连续加法 SELECT
  // （加法项之间只有换行，绝不允许 `+;` 截断表达式——R3 真实改密轮曾因此 ERROR 1064）。
  const rows = mysqlQuery(
    [
      `SELECT COUNT(*) FROM base_user_account WHERE id = ${id}`,
      `SELECT COUNT(*) FROM base_user_info WHERE account_id = ${id}`,
      `SELECT (SELECT COUNT(*) FROM engineer_response WHERE customer_account_id = ${id} OR engineer_account_id = ${id}) +
              (SELECT COUNT(*) FROM ai_message WHERE conversation_id IN (SELECT id FROM ai_conversation WHERE engineer_account_id = ${id})) +
              (SELECT COUNT(*) FROM ai_report WHERE engineer_account_id = ${id}) +
              (SELECT COUNT(*) FROM ai_conversation WHERE engineer_account_id = ${id}) +
              (SELECT COUNT(*) FROM repair_request WHERE customer_account_id = ${id} OR accepted_by_engineer_account_id = ${id}) +
              (SELECT COUNT(*) FROM reference_document WHERE created_by_account_id = ${id})`,
    ].join('; '),
  )
    .split('\n')
    .map((value) => Number(value));

  if (rows.length !== 3 || rows.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`专用账号残留核对返回异常：${JSON.stringify(rows)}`);
  }

  return { account: rows[0], userInfo: rows[1], relatedBusiness: rows[2] };
}
