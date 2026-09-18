// src/features/admin-document-database/ui/admin-created-at-range.spec.ts

import dayjs, { type Dayjs } from 'dayjs';
import { describe, expect, it } from 'vitest';

import { toAdminCreatedAtRange } from './admin-created-at-range';

/**
 * PR3 S5：时间范围筛选 → 契约边界纯函数单测（分支穷举）。
 *
 * 契约要点（schema「含端」）：起点取当日 00:00、终点取当日 23:59:59.999。
 * 逐分支验证：未选择 / 仅起点 / 仅终点 / 两端齐全 / 两端皆空的元组，
 * 避免「空态被误当成一个越界边界」把整表筛空。
 */
describe('toAdminCreatedAtRange', () => {
  const sample: Dayjs = dayjs('2026-09-15T13:45:30.000Z');

  it('range 为 null 时返回空对象（不产生任何时间边界）', () => {
    expect(toAdminCreatedAtRange(null)).toEqual({});
  });

  it('两端皆 null 的元组同样返回空对象', () => {
    expect(toAdminCreatedAtRange([null, null])).toEqual({});
  });

  it('仅起点：createdAtFrom 取当日 00:00，不含 createdAtTo', () => {
    const result = toAdminCreatedAtRange([sample, null]);

    expect(result).toEqual({ createdAtFrom: sample.startOf('day').toISOString() });
    expect(result.createdAtFrom).toBe(sample.startOf('day').toISOString());
    expect(result.createdAtTo).toBeUndefined();
  });

  it('仅终点：createdAtTo 取当日 23:59:59.999（含端），不含 createdAtFrom', () => {
    const result = toAdminCreatedAtRange([null, sample]);

    expect(result).toEqual({ createdAtTo: sample.endOf('day').toISOString() });
    expect(result.createdAtFrom).toBeUndefined();
    expect(result.createdAtTo).toBe(sample.endOf('day').toISOString());
  });

  it('两端齐全：起点 startOf、终点 endOf 一并返回', () => {
    const from = dayjs('2026-09-01T08:00:00.000Z');
    const to = dayjs('2026-09-30T20:00:00.000Z');
    const result = toAdminCreatedAtRange([from, to]);

    expect(result).toEqual({
      createdAtFrom: from.startOf('day').toISOString(),
      createdAtTo: to.endOf('day').toISOString(),
    });
  });

  it('终点确为当日最后一毫秒（含端语义），非零填充当日 00:00', () => {
    const result = toAdminCreatedAtRange([null, sample]);
    const to = dayjs(result.createdAtTo);

    expect(to.hour()).toBe(23);
    expect(to.minute()).toBe(59);
    expect(to.second()).toBe(59);
    expect(to.millisecond()).toBe(999);
  });
});
