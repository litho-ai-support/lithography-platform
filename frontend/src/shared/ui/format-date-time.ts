// src/shared/ui/format-date-time.ts

/**
 * 全局展示时间的唯一实现（维修申请与参考资料切片共用）。
 * 后端 Date 标量为 ISO 字符串；解析失败时占位，不展示原始值误导用户。
 * 原 repair-request / reference-document 切片内的同名副本已收敛至此，
 * 后续切片需要展示时间时直接复用，不再各自实现。
 */
export function formatDateTimeText(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}
