// test/utils/e2e-db-guard.ts

/**
 * E2E 目标数据库硬性守卫（0918 P0 决策 / codex review M-02）。
 *
 * 目的：任何会写库/删库的 E2E 动作（global-setup 全库 TRUNCATE、spec 夹具删除）
 * 之前，都必须先确认「实际连接的库」属于明确允许的 E2E 隔离库白名单。
 * 该校验是**不可跳过**的安全前置：E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP
 * 等开关最多跳过健康检查或全库 TRUNCATE，绝不能绕过库名校验、允许在未验证库上删数据。
 */
import type { DataSource } from 'typeorm';

/**
 * 物理删除的显式清理许可开关名。
 * 必须由执行者在启动前显式设置为 1：代码中不提供默认值，也不写入任何 npm script。
 */
export const E2E_PHYSICAL_CLEANUP_CONSENT_ENV = 'E2E_ALLOW_PHYSICAL_CLEANUP';

/**
 * 第二道独立门禁（纯校验）：物理删除前必须存在显式清理许可。
 *
 * 与库名白名单相互独立：本函数刻意不读取库名，`assertAllowedE2eDatabase` 也刻意不读取
 * 本开关。两道门禁任一缺失都必须失败关闭，任何开关都不能替代或绕过另一道门禁。
 */
export const assertPhysicalCleanupConsent = (): void => {
  if (process.env[E2E_PHYSICAL_CLEANUP_CONSENT_ENV] !== '1') {
    throw new Error(
      `拒绝执行物理删除：缺少显式清理许可 ${E2E_PHYSICAL_CLEANUP_CONSENT_ENV}=1。` +
        `该开关必须由执行者在启动前显式设置为 1（不提供默认值，也不写入 npm script）；` +
        `它与 E2E 库名白名单是两道互相独立的门禁，任一门禁缺失都必须在第一条删除语句前失败关闭。`,
    );
  }
};

/** 允许被 E2E 操作的库名白名单（逗号分隔，大小写不敏感；默认仅隔离测试库）。 */
export const resolveAllowedE2eDatabases = (): string[] => {
  const raw = process.env.E2E_ALLOWED_DB_NAMES || 'lithography_e2e';
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
};

/**
 * 纯校验：目标库必须属于白名单，否则抛错。不触碰任何数据，可安全前置调用。
 */
export const assertAllowedE2eDatabase = (currentDatabase: string): void => {
  const normalized = (currentDatabase ?? '').trim().toLowerCase();
  const allowed = resolveAllowedE2eDatabases();
  if (!normalized || !allowed.includes(normalized)) {
    throw new Error(
      `拒绝在 E2E 目标库上执行破坏性操作：当前库 "${normalized || '(未知)'}" 不在允许的 E2E 库白名单 [${allowed.join(', ')}] 内。` +
        `该库名校验为硬性前置，E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP 等开关均无法绕过；` +
        `请确认 .env.e2e 的 DB_NAME 指向隔离测试库。`,
    );
  }
};

/**
 * 读取给定 DataSource 实际连接的库并做硬性白名单校验（仅 SELECT DATABASE()，不写数据）。
 * global-setup 与各写夹具的 spec 在第一次删除前复用同一守卫。
 */
export const assertDataSourceOnAllowedE2eDatabase = async (ds: DataSource): Promise<string> => {
  const rows: Array<{ current_database: string | null }> = await ds.query(
    'SELECT DATABASE() AS current_database',
  );
  const currentDatabase = rows[0]?.current_database ?? '';
  assertAllowedE2eDatabase(currentDatabase);
  return currentDatabase.trim().toLowerCase();
};
