// src/shared/ui/data-card/index.tsx

import type { ReactNode } from 'react';

type DataCardProps = {
  children: ReactNode;
  extra?: ReactNode;
  title?: ReactNode;
};

// 普通卡片：gkj 卡片语言（白底、细描边、轻投影），样式见 index.css 的 .data-card。
export function DataCard({ children, extra, title }: DataCardProps) {
  return (
    <section className="data-card">
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
