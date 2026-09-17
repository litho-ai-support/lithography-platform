// src/shared/ui/stat-card/stat-card.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatCard } from './index';

describe('StatCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders label, value and optional hint inside a data card', () => {
    render(<StatCard hint="较上周 +2" label="在线设备" value={12} />);

    expect(screen.getByText('在线设备')).toHaveClass('stat-card-label');
    expect(screen.getByText('12')).toHaveClass('stat-card-value');
    expect(screen.getByText('较上周 +2')).toHaveClass('stat-card-hint');
  });

  it('omits the hint line when not provided', () => {
    render(<StatCard label="标签" value="8" />);

    expect(document.querySelector('.stat-card-hint')).toBeNull();
  });
});
