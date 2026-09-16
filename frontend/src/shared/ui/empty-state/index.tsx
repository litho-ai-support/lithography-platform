// src/shared/ui/empty-state/index.tsx

import type { ReactNode } from 'react';

type EmptyStateProps = {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

// 空态：gkj .platform-empty 语言（虚线框 + 居中提示 + 可选操作）。
export function EmptyState({ action, description, title }: EmptyStateProps) {
  const isSimple = !action && !description;

  return (
    <div className={`empty-state${isSimple ? ' empty-state--simple' : ''}`}>
      <h3 className="empty-state-title">{title}</h3>
      {description ? <p className="empty-state-description">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
