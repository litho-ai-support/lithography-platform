// src/shared/ui/toolbar-controls/toolbar-controls.spec.tsx

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolbarButton, ToolbarSearchField } from './index';

describe('ToolbarSearchField / ToolbarButton（跨页共享中性控件，PR4 收口）', () => {
  afterEach(() => {
    cleanup();
  });

  it('搜索框只挂中性类与描边图标，输入触发 onChange', () => {
    const onChange = vi.fn();

    render(<ToolbarSearchField onChange={onChange} placeholder="按客户昵称搜索" value="" />);

    const input = screen.getByPlaceholderText('按客户昵称搜索');
    const shell = input.closest('label');
    expect(shell).toHaveClass('toolbar-search');
    // 非知识库页面不得消费 .kb-* 专属类
    expect(shell?.className).not.toContain('kb-');
    expect(shell?.querySelector('svg')).not.toBeNull();

    fireEvent.change(input, { target: { value: '陈工' } });
    expect(onChange).toHaveBeenCalledWith('陈工');
  });

  it('有输入时渲染中性清除按钮，点击回传空值', () => {
    const onChange = vi.fn();

    render(<ToolbarSearchField onChange={onChange} placeholder="按客户昵称搜索" value="陈工" />);

    const clear = screen.getByRole('button', { name: '清除按客户昵称搜索' });
    expect(clear).toHaveClass('toolbar-search-clear');

    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('无输入时不渲染清除按钮', () => {
    render(<ToolbarSearchField onChange={vi.fn()} placeholder="按客户昵称搜索" value="" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('工具按钮按 props 输出中性 active 类与 aria-expanded，点击触发回调', () => {
    const onClick = vi.fn();

    render(
      <ToolbarButton active aria-expanded onClick={onClick}>
        筛选
      </ToolbarButton>,
    );

    const button = screen.getByRole('button', { name: '筛选' });
    expect(button).toHaveClass('toolbar-button', 'toolbar-button--active');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button.className).not.toContain('kb-');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('非 active 的工具按钮不输出 active 类', () => {
    render(<ToolbarButton onClick={vi.fn()}>清除筛选</ToolbarButton>);

    const button = screen.getByRole('button', { name: '清除筛选' });
    expect(button).toHaveClass('toolbar-button');
    expect(button).not.toHaveClass('toolbar-button--active');
  });

  it('附加类名与中性基类合并输出，不替换基类', () => {
    render(
      <ToolbarSearchField
        className="list-toolbar-search"
        clearClassName="list-toolbar-search-clear"
        onChange={vi.fn()}
        placeholder="按客户昵称搜索"
        value="陈工"
      />,
    );

    expect(screen.getByPlaceholderText('按客户昵称搜索').closest('label')).toHaveClass(
      'toolbar-search',
      'list-toolbar-search',
    );
    expect(screen.getByRole('button', { name: '清除按客户昵称搜索' })).toHaveClass(
      'toolbar-search-clear',
      'list-toolbar-search-clear',
    );
  });
});
