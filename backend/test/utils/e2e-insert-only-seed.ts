// test/utils/e2e-insert-only-seed.ts

/**
 * 「固定主键碰撞」用例的**仅创建**写入工具（第四轮 Review P1-1 / P1-2）。
 *
 * 背景：TypeORM `Repository.save(entity_with_id)` 在主键已存在时会走 UPDATE。
 * 于是用于证明「固定主键不代表所有权」的测试，反而可能先覆盖隔离库中的既有行，
 * 再拍一张「改后」快照，让断言通过也无法证明原数据安全。
 *
 * 本工具把「占用历史固定数字 ID」收敛为仅创建语义：
 * 1. 写入前先确认目标主键在目标库中空闲（只读 SELECT），已被占用即失败关闭（绝不覆盖）；
 * 2. 真正写入使用 `Repository.insert()` —— TypeORM 仅在显式 `.orUpdate()` 时才生成
 *    `ON DUPLICATE KEY UPDATE`（见 `InsertQueryBuilder`），否则是纯 INSERT；
 * 3. 预检查与 INSERT 之间的竞态由唯一键兜底：主键冲突只报错，绝不回退成更新既有行。
 *
 * 调用方仍须在第一次写入前通过目标库白名单守卫（e2e-db-guard）。
 */
import type { ObjectLiteral, QueryDeepPartialEntity, Repository } from 'typeorm';

const asFixedId = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label}：固定主键必须是正整数，收到 ${String(value)}`);
  }
  return value;
};

/** 从待写入行中读取显式固定主键；缺省即调用方错误（不得依赖数据库生成）。 */
const readFixedId = <T extends ObjectLiteral>(
  row: QueryDeepPartialEntity<T>,
  label: string,
): number => asFixedId((row as unknown as { id?: unknown }).id, label);

/**
 * 只读校验：目标固定主键必须全部空闲。任一被占用即抛错，不产生任何写入。
 *
 * `withDeleted()`：软删除行同样占用主键，必须计入「已占用」；对无软删除列的实体是安全空操作
 * （TypeORM 仅在 `metadata.deleteDateColumn` 存在时才追加 `IS NULL` 过滤）。
 */
export const assertFixedIdsVacant = async <T extends ObjectLiteral>(
  repo: Repository<T>,
  label: string,
  ids: readonly number[],
): Promise<void> => {
  const wanted = [...new Set(ids.map((id) => asFixedId(id, label)))];
  if (wanted.length === 0) {
    return;
  }
  const occupied = await repo
    .createQueryBuilder('row')
    .withDeleted()
    .select('row.id', 'id')
    .where('row.id IN (:...ids)', { ids: wanted })
    .getRawMany<{ id: number }>();
  if (occupied.length > 0) {
    const found = occupied.map((row) => row.id).sort((left, right) => left - right);
    throw new Error(
      `${label}：目标固定主键 ${found.join(', ')} 已被 ${repo.metadata.tableName} 中的既有行占用，` +
        `拒绝写入（固定主键不代表所有权；如需该场景请在可销毁的独立测试库中构造）。`,
    );
  }
};

/**
 * 仅创建写入：先验证目标固定主键空闲，再以 INSERT 语义写入。
 * @returns 实际写入的固定主键（调用方据此精确回收本次写入的行）
 */
export const insertOnlyAtFixedIds = async <T extends ObjectLiteral>(
  repo: Repository<T>,
  label: string,
  rows: readonly QueryDeepPartialEntity<T>[],
): Promise<number[]> => {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => readFixedId(row, label));
  await assertFixedIdsVacant(repo, label, ids);
  await repo.insert([...rows]);
  return ids;
};
