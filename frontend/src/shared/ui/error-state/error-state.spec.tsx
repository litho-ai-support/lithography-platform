// src/shared/ui/error-state/error-state.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorState } from './index';

describe('ErrorState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, description and retry action', () => {
    render(
      <ErrorState
        action={<button type="button">重试</button>}
        description="请检查网络后重试"
        title="加载失败"
      />,
    );

    const container = screen.getByRole('heading', { name: '加载失败' }).closest('div');

    expect(container).toHaveClass('error-state');
    expect(screen.getByText('请检查网络后重试')).toHaveClass('error-state-description');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('renders the title only when description and action are omitted', () => {
    render(<ErrorState title="出错了" />);

    expect(screen.getByText('出错了')).toBeInTheDocument();
    expect(document.querySelector('.error-state-description')).toBeNull();
    expect(document.querySelector('.error-state-action')).toBeNull();
  });
});
