// src/shared/ui/filter-bar/index.tsx

import type { ReactNode } from 'react';

type FilterBarProps = {
  children: ReactNode;
};

// 筛选栏：横排筛选控件容器（样式见 index.css 的 .filter-bar）。
export function FilterBar({ children }: FilterBarProps) {
  return <div className="filter-bar">{children}</div>;
}
