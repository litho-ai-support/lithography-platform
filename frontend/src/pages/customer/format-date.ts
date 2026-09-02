// src/pages/customer/format-date.ts

// 客户侧页面共用的时间展示格式（本地时区，分钟精度）。
// 后端契约时间为 ISO 字符串；仅展示格式化，不改动契约值本身。
const formatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return formatter.format(date);
}
