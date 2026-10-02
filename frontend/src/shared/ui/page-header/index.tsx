// src/shared/ui/page-header/index.tsx

import type { ReactNode } from 'react';

type PageHeaderProps = {
  description?: ReactNode;
  eyebrow?: ReactNode;
  extra?: ReactNode;
  title: ReactNode;
  /**
   * 页面级视觉变体：'knowledge-base' 供 /admin/document-database 使用（PR3 R7，
   * 原型 10px eyebrow / 20-28 标题 / 12-16 简介）；'reference-library' 供
   * /reference-documents 精确列表路由使用（PR5 整页视觉计划，数值与知识库变体同源，
   * 但输出独立类名以避免两个路由互相扩散）；默认保持通用基准不变。
   */
  variant?: 'default' | 'knowledge-base' | 'reference-library';
};

// 页头：eyebrow 为可选装饰性小标（原型主壳静态页头：10px/700/.18em/uppercase），
// 仅在原型对应工作台页传入，不强行加入无 eyebrow 的通用页面（逐条复核报告 20260916
// 修复建议 4）。样式见 index.css 的 .page-eyebrow。
// variant='knowledge-base' 输出 .page-header--kb，variant='reference-library' 输出
// .page-header--reference-library（两条选择器共用同一份紧凑数值声明，但类名互不借用，
// 依据见 frontend/docs/gkj-visual-baseline.md 第 6 节）。
const VARIANT_CLASS_NAMES: Record<NonNullable<PageHeaderProps['variant']>, string> = {
  default: '',
  'knowledge-base': ' page-header--kb',
  'reference-library': ' page-header--reference-library',
};

export function PageHeader({
  description,
  eyebrow,
  extra,
  title,
  variant = 'default',
}: PageHeaderProps) {
  return (
    <div className={`page-header${VARIANT_CLASS_NAMES[variant]}`}>
      <div className="page-header-content">
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {extra ? <div className="page-header-extra">{extra}</div> : null}
    </div>
  );
}
