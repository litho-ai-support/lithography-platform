// src/shared/ui/status-pill/status-pill.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusPill } from './index';

describe('StatusPill', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children with the requested tone class', () => {
    render(<StatusPill tone="ok">正常</StatusPill>);

    const pill = screen.getByText('正常');

    expect(pill).toHaveClass('status-pill', 'status-pill--ok');
  });

  it.each(['warn', 'critical', 'neutral'] as const)('applies the %s tone class', (tone) => {
    render(<StatusPill tone={tone}>状态</StatusPill>);

    expect(screen.getByText('状态')).toHaveClass(`status-pill--${tone}`);
  });
});
