// src/shared/ui/stat-card/index.tsx

import type { ReactNode } from 'react';

type StatCardProps = {
  hint?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

// 统计卡片：gkj .metric-tile 语言——白→淡蓝渐变、stat-card-border 描边、14px 圆角、无投影；
// 任务书明确统计卡片不是普通 panel-card，故不再复用 DataCard（逐条复核报告 20260916）。
// 样式见 index.css 的 .stat-card。
export function StatCard({ hint, label, value }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="stat-card-label">{label}</p>
      <p className="stat-card-value">{value}</p>
      {hint ? <p className="stat-card-hint">{hint}</p> : null}
    </div>
  );
}
