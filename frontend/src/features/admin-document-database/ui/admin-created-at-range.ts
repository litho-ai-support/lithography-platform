// src/features/admin-document-database/ui/admin-created-at-range.ts

import type { Dayjs } from 'dayjs';

/** 时间范围筛选状态：null 表示未选择（与 antd RangePicker 受控值同形） */
export type AdminCreatedAtRangeState = [Dayjs | null, Dayjs | null] | null;

/** 转为契约时间边界：起点取当日 00:00、终点取当日 23:59:59.999（schema 注释「含端」） */
export function toAdminCreatedAtRange(range: AdminCreatedAtRangeState): {
  createdAtFrom?: string;
  createdAtTo?: string;
} {
  const [from, to] = range ?? [];

  return {
    ...(from ? { createdAtFrom: from.startOf('day').toISOString() } : {}),
    ...(to ? { createdAtTo: to.endOf('day').toISOString() } : {}),
  };
}
