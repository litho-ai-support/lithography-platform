// src/shared/ui/status-pill/index.tsx

import type { ReactNode } from 'react';

export type StatusPillTone = 'critical' | 'neutral' | 'ok' | 'warn';

type StatusPillProps = {
  children: ReactNode;
  tone: StatusPillTone;
};

const TONE_CLASS_NAME: Record<StatusPillTone, string> = {
  critical: 'status-pill--critical',
  neutral: 'status-pill--neutral',
  ok: 'status-pill--ok',
  warn: 'status-pill--warn',
};

// 状态胶囊：视觉基准 gkj 的 999px 胶囊语言，色彩只消费主题语义变量（见 index.css）。
export function StatusPill({ children, tone }: StatusPillProps) {
  return <span className={`status-pill ${TONE_CLASS_NAME[tone]}`}>{children}</span>;
}
