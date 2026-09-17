// src/shared/ui/data-card/data-card.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DataCard } from './index';

describe('DataCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, extra and children inside the card container', () => {
    render(
      <DataCard extra={<button type="button">操作</button>} title="卡片标题">
        <p>卡片内容</p>
      </DataCard>,
    );

    const card = screen.getByText('卡片内容').closest('section');

    expect(card).toHaveClass('data-card');
    expect(screen.getByRole('heading', { name: '卡片标题' })).toHaveClass('data-card-title');
    expect(card?.querySelector('.data-card-extra')?.textContent).toContain('操作');
  });

  it('omits the header area when neither title nor extra is provided', () => {
    render(
      <DataCard>
        <p>仅内容</p>
      </DataCard>,
    );

    expect(
      screen.getByText('仅内容').closest('section')?.querySelector('.data-card-header'),
    ).toBeNull();
  });
});
