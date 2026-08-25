// 文件位置：src/modules/common/utils/series-schedule-hash.util.ts
import { createHash } from 'crypto';

export interface HashableSeries {
  readonly id: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly recurrenceRule: string | null;
}

/**
 * 生成稳定校验哈希（通用工具）
 * 用途：任意需要“预览/发布 一致性校验”的领域对象均可复用
 * 当前字段面向带起止时间与重复规则的系列对象；后续如需扩展，可在调用方构造相同结构的对象
 * 算法：SHA-256 → hex；版本号默认为 'v1'，统一在此升级
 */
export function computeSeriesScheduleHash(
  series: HashableSeries,
  algoVersion: 'v1' = 'v1',
): string {
  const payload = {
    seriesId: series.id,
    startDate: series.startDate,
    endDate: series.endDate,
    recurrenceRule: series.recurrenceRule ?? null,
    algoVersion,
  } as const;
  const serialized = JSON.stringify(payload);
  return createHash('sha256').update(serialized).digest('hex');
}
