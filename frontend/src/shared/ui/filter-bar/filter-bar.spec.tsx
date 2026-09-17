// src/shared/ui/filter-bar/filter-bar.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterBar } from './index';

describe('FilterBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children inside the filter bar container', () => {
    render(
      <FilterBar>
        <input placeholder="搜索" />
        <button type="button">筛选</button>
      </FilterBar>,
    );

    const bar = screen.getByPlaceholderText('搜索').closest('div');

    expect(bar).toHaveClass('filter-bar');
    expect(screen.getByText('筛选')).toBeInTheDocument();
  });
});
