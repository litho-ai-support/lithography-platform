// src/shared/ui/table-container/index.tsx

import type { ReactNode } from 'react';

type TableContainerProps = {
  children: ReactNode;
  extra?: ReactNode;
  title?: ReactNode;
};

// 表格容器：统一表格区的容器卡片、标题与操作位（样式见 index.css 的 .table-container）。
export function TableContainer({ children, extra, title }: TableContainerProps) {
  return (
    <section className="table-container">
      {title || extra ? (
        <div className="data-card-header">
          {title ? <h3 className="data-card-title">{title}</h3> : null}
          {extra ? <div className="data-card-extra">{extra}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
