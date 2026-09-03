// src/features/repair-request/ui/format-date-time.ts

/**
 * 维修申请切片内展示时间的唯一实现（列表与详情共用）。
 * 后端 Date 标量为 ISO 字符串；解析失败时占位，不展示原始值误导用户。
 */
export function formatDateTimeText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}
