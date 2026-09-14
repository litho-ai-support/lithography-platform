// src/shared/ui/loading-state/index.tsx

import { Spin } from 'antd';
import type { ReactNode } from 'react';

type LoadingStateProps = {
  label?: ReactNode;
};

// 加载态：居中 Spin + 可选说明文字；role=status 让辅助技术感知进行中状态。
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status">
      <Spin size="small" />
      {label ? <span className="loading-state-label">{label}</span> : null}
    </div>
  );
}
