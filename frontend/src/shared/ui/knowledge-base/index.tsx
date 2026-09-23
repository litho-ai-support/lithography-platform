// src/shared/ui/knowledge-base/index.tsx

import type { ReactNode } from 'react';

// 知识库页（/admin/document-database）opt-in primitive（PR3 R7）：
// 只挂 .kb-* 页面级类，样式见 index.css 知识库页区段与
// frontend/docs/gkj-visual-baseline.md 第 6 节；默认公共组件
//（PageHeader / FilterBar / TableContainer / AntD Table）样式不受本文件影响。

type KbSearchFieldProps = {
  /** 清除按钮出现时使用（有输入时才渲染） */
  clearLabel?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

/**
 * 主搜索框：36px 高 / 6px 圆角 / 16×16 描边搜索图标
 *（原型 #knowledge-base-page 卡内工具区）。
 * 使用原生 input 直连受控值，避免 AntD Input 内部结构影响 36px 几何；
 * 清除按钮为可用性保留（原型无，属业务扩展）。
 */
export function KbSearchField({ clearLabel, onChange, placeholder, value }: KbSearchFieldProps) {
  return (
    <label className="kb-search">
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
          className="kb-search-clear"
          type="button"
          onClick={() => onChange('')}
        >
          ×
        </button>
      ) : null}
    </label>
  );
}

type KbToolbarButtonProps = {
  /** 有生效筛选时置为 true（文字与边框转主蓝） */
  active?: boolean;
  'aria-expanded'?: boolean;
  children: ReactNode;
  onClick: () => void;
};

/** 工具区按钮（筛选入口 / 重置等）：36px 高 / 6px 圆角，与主搜索框同排 */
export function KbToolbarButton({
  active = false,
  'aria-expanded': ariaExpanded,
  children,
  onClick,
}: KbToolbarButtonProps) {
  return (
    <button
      aria-expanded={ariaExpanded}
      className={active ? 'kb-toolbar-button kb-toolbar-button--active' : 'kb-toolbar-button'}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
