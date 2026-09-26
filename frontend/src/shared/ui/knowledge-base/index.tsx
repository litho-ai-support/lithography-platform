// src/shared/ui/knowledge-base/index.tsx

import type { ReactNode } from 'react';

import { ToolbarButton, ToolbarSearchField } from '@/shared/ui/toolbar-controls';

// 知识库页（/admin/document-database）opt-in primitive（PR3 R7）：
// 只挂 .kb-* 页面级类，样式见 index.css 知识库页区段与
// frontend/docs/gkj-visual-baseline.md 第 6 节；默认公共组件
//（PageHeader / FilterBar / TableContainer / AntD Table）样式不受本文件影响。
//
// KbSearchField / KbToolbarButton 是跨页共享中性控件（shared/ui/toolbar-controls）
// 的薄包装：DOM 上同时保留中性基类与知识库覆盖层类，本文件不再自持结构或行为。
// 非知识库页面一律直接消费 toolbar-controls 的中性组件，不得消费 .kb-* 类
//（基准表第 6 节适用范围：.kb-* 仅限 /admin/document-database）。

type KbSearchFieldProps = {
  /** 清除按钮出现时使用（有输入时才渲染） */
  clearLabel?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

/** 主搜索框：知识库页外观 = 中性控件 + .kb-search 覆盖层 */
export function KbSearchField({ clearLabel, onChange, placeholder, value }: KbSearchFieldProps) {
  return (
    <ToolbarSearchField
      className="kb-search"
      clearClassName="kb-search-clear"
      clearLabel={clearLabel}
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  );
}

type KbToolbarButtonProps = {
  /** 有生效筛选时置为 true（文字与边框转主蓝） */
  active?: boolean;
  'aria-expanded'?: boolean;
  children: ReactNode;
  onClick: () => void;
};

/** 工具区按钮：知识库页外观 = 中性控件 + .kb-toolbar-button 覆盖层 */
export function KbToolbarButton({
  active = false,
  'aria-expanded': ariaExpanded,
  children,
  onClick,
}: KbToolbarButtonProps) {
  return (
    <ToolbarButton
      active={active}
      activeClassName="kb-toolbar-button--active"
      aria-expanded={ariaExpanded}
      className="kb-toolbar-button"
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}
