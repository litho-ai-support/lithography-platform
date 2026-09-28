// src/shared/ui/toolbar-controls/index.tsx

import type { ReactNode } from 'react';

// 跨页共享的中性工具控件（PR4 收口）：「主搜索 + 工具按钮」是工程师维修申请列表
// 与知识库页共用的控件级外观，中性基座规则见 index.css「跨页共享的中性工具控件」区段。
//
// 知识库页（仅 /admin/document-database）opt-in 的 .kb-* 类只是在本组件之上追加的
// 覆盖层（见 shared/ui/knowledge-base 的薄包装）；两处当前渲染结果相同，若日后分叉，
// 必须同步更新 frontend/docs/gkj-visual-baseline.md，不得只改一边。
//
// 本模块不得挂页面级路由判断或任一页面的专属语义。

type ToolbarSearchFieldProps = {
  /** 容器附加类名（知识库页传入 .kb-search 覆盖层）；中性基类始终保留 */
  className?: string;
  /** 清除按钮附加类名（知识库页传入 .kb-search-clear） */
  clearClassName?: string;
  /** 清除按钮出现时使用（有输入时才渲染） */
  clearLabel?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

/**
 * 主搜索框：36px 高 / 6px 圆角 / 16×16 描边搜索图标。
 * 使用原生 input 直连受控值，避免 AntD Input 内部结构影响 36px 几何；
 * 清除按钮为可用性保留（原型无，属业务扩展）。
 */
export function ToolbarSearchField({
  className,
  clearClassName,
  clearLabel,
  onChange,
  placeholder,
  value,
}: ToolbarSearchFieldProps) {
  return (
    <label className={joinClassNames('toolbar-search', className)}>
      <svg aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          aria-label={clearLabel ?? `清除${placeholder}`}
          className={joinClassNames('toolbar-search-clear', clearClassName)}
          type="button"
          onClick={() => onChange('')}
        >
          ×
        </button>
      ) : null}
    </label>
  );
}

type ToolbarButtonProps = {
  /** 有生效筛选时置为 true（文字与边框转主蓝） */
  active?: boolean;
  /** 附加类名（知识库页传入 .kb-toolbar-button 覆盖层）；中性基类始终保留 */
  className?: string;
  /** 选中态附加类名（知识库页传入 .kb-toolbar-button--active） */
  activeClassName?: string;
  'aria-expanded'?: boolean;
  children: ReactNode;
  onClick: () => void;
};

/** 工具区按钮（筛选入口 / 重置等）：36px 高 / 6px 圆角，与主搜索框同排 */
export function ToolbarButton({
  active = false,
  activeClassName,
  className,
  'aria-expanded': ariaExpanded,
  children,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      aria-expanded={ariaExpanded}
      className={joinClassNames(
        'toolbar-button',
        className,
        active ? 'toolbar-button--active' : undefined,
        active ? activeClassName : undefined,
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
