// src/shared/ui/page-header/index.tsx

import type { ReactNode } from 'react';

type PageHeaderProps = {
  description?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
};

export function PageHeader({ description, extra, title }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-content">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {extra ? <div className="page-header-extra">{extra}</div> : null}
    </div>
  );
}
