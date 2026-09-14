// src/shared/ui/stat-card/index.tsx

import type { ReactNode } from 'react';

import { DataCard } from '@/shared/ui/data-card';

type StatCardProps = {
  hint?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

// 统计卡片：数据卡 + 大数值排版（gkj .health-score 语言）。
export function StatCard({ hint, label, value }: StatCardProps) {
  return (
    <DataCard>
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{value}</p>
      {hint ? <p className="stat-card-hint">{hint}</p> : null}
    </DataCard>
  );
}
