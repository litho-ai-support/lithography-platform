// src/shared/ui/error-state/index.tsx

import type { ReactNode } from 'react';

type ErrorStateProps = {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
};

// 错误态：与空态同构的反面色反馈，action 常放重试入口。
export function ErrorState({ action, description, title }: ErrorStateProps) {
  const isSimple = !action && !description;

  return (
    <div className={`error-state${isSimple ? ' error-state--simple' : ''}`}>
      <h3 className="error-state-title">{title}</h3>
      {description ? <p className="error-state-description">{description}</p> : null}
      {action ? <div className="error-state-action">{action}</div> : null}
    </div>
  );
}
