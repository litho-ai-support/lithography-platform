// src/shared/ui/empty-state/empty-state.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './index';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, description and action', () => {
    render(
      <EmptyState
        action={<button type="button">新建</button>}
        description="尚无记录，可从下方动作开始"
        title="暂无数据"
      />,
    );

    const container = screen.getByText('暂无数据').closest('div');

    expect(container).toHaveClass('empty-state');
    expect(screen.getByText('尚无记录，可从下方动作开始')).toHaveClass('empty-state-description');
    expect(container?.querySelector('.empty-state-action')?.textContent).toContain('新建');
  });

  it('renders the title only when description and action are omitted', () => {
    render(<EmptyState title="空空如也" />);

    expect(screen.getByText('空空如也')).toBeInTheDocument();
    expect(document.querySelector('.empty-state-description')).toBeNull();
    expect(document.querySelector('.empty-state-action')).toBeNull();
  });
});
