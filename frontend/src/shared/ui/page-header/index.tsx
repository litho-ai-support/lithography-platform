// src/shared/ui/page-header/index.tsx

import type { ReactNode } from 'react';

type PageHeaderProps = {
  description?: ReactNode;
  eyebrow?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
};

// 页头：eyebrow 为可选装饰性小标（gkj .atta-eyebrow：10px/800/.16em/uppercase），
// 仅在原型对应工作台页传入，不强行加入无 eyebrow 的通用页面（逐条复核报告 20260916
// 修复建议 4）。样式见 index.css 的 .page-eyebrow。
export function PageHeader({ description, eyebrow, extra, title }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-content">
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {extra ? <div className="page-header-extra">{extra}</div> : null}
    </div>
  );
}
