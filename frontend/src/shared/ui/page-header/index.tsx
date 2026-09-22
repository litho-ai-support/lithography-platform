// src/shared/ui/page-header/index.tsx

import type { ReactNode } from 'react';

type PageHeaderProps = {
  description?: ReactNode;
  eyebrow?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
  /**
   * 页面级视觉变体：'knowledge-base' 供 /admin/document-database 使用（PR3 R7，
   * 原型 10px eyebrow / 20-28 标题 / 12-16 简介）；默认保持通用基准不变。
   */
  variant?: 'default' | 'knowledge-base';
};

// 页头：eyebrow 为可选装饰性小标（gkj .atta-eyebrow：10px/800/.16em/uppercase），
// 仅在原型对应工作台页传入，不强行加入无 eyebrow 的通用页面（逐条复核报告 20260916
// 修复建议 4）。样式见 index.css 的 .page-eyebrow。
// variant='knowledge-base' 时追加 .page-header--kb 紧凑变体（仅知识库页消费，
// 与通用层级不同的依据见 frontend/docs/gkj-visual-baseline.md 第 6 节）。
export function PageHeader({
  description,
  eyebrow,
  extra,
  title,
  variant = 'default',
}: PageHeaderProps) {
  return (
    <div className={variant === 'knowledge-base' ? 'page-header page-header--kb' : 'page-header'}>
      <div className="page-header-content">
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {extra ? <div className="page-header-extra">{extra}</div> : null}
    </div>
  );
}
