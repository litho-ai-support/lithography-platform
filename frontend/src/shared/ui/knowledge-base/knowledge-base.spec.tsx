// src/shared/ui/knowledge-base/knowledge-base.spec.tsx

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KbSearchField, KbToolbarButton } from './index';

describe('KbSearchField / KbToolbarButton（知识库页 opt-in primitive，PR3 R7）', () => {
  afterEach(() => {
    cleanup();
  });

  it('搜索框渲染 .kb-search 容器与描边图标，输入触发 onChange', () => {
    const onChange = vi.fn();

    render(<KbSearchField onChange={onChange} placeholder="按文档标题搜索" value="" />);

    const input = screen.getByPlaceholderText('按文档标题搜索');
    expect(input.closest('label')).toHaveClass('kb-search');
    expect(input.closest('label')?.querySelector('svg')).not.toBeNull();

    fireEvent.change(input, { target: { value: '手册' } });
    expect(onChange).toHaveBeenCalledWith('手册');
  });

  it('有输入时渲染清除按钮，点击回传空值', () => {
    const onChange = vi.fn();

    render(<KbSearchField onChange={onChange} placeholder="按文档标题搜索" value="手册" />);

    expect(screen.queryByRole('button')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清除按文档标题搜索' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('无输入时不渲染清除按钮', () => {
    render(<KbSearchField onChange={vi.fn()} placeholder="按文档标题搜索" value="" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('工具按钮按 props 输出 active 类与 aria-expanded，点击触发回调', () => {
    const onClick = vi.fn();

    render(
      <KbToolbarButton active aria-expanded={false} onClick={onClick}>
        筛选
      </KbToolbarButton>,
    );

    const button = screen.getByRole('button', { name: '筛选' });
    expect(button).toHaveClass('kb-toolbar-button', 'kb-toolbar-button--active');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
