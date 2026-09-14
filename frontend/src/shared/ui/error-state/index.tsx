// src/shared/ui/error-state/index.tsx

import type { ReactNode } from 'react';

type ErrorStateProps = {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

// 错误态：与空态同构的反面色反馈，action 常放重试入口。
export function ErrorState({ action, description, title }: ErrorStateProps) {
  return (
    <div className="error-state">
      <p className="error-state-title">{title}</p>
      {description ? <p className="error-state-description">{description}</p> : null}
      {action ? <div className="error-state-action">{action}</div> : null}
    </div>
  );
}
