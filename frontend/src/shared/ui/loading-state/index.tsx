// src/shared/ui/loading-state/index.tsx

import { Spin } from 'antd';
import type { ReactNode } from 'react';

type LoadingStateProps = {
  label?: ReactNode;
};

// 加载态：居中 Spin + 可选说明文字。
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="loading-state">
      <Spin size="small" />
      {label ? <span className="loading-state-label">{label}</span> : null}
    </div>
  );
}
