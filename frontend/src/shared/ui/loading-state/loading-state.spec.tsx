// src/shared/ui/loading-state/loading-state.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingState } from './index';

describe('LoadingState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a spinner with the optional label', () => {
    render(<LoadingState label="正在加载" />);

    expect(document.querySelector('.loading-state .ant-spin')).not.toBeNull();
    expect(screen.getByText('正在加载')).toHaveClass('loading-state-label');
  });

  it('renders the spinner only when no label is provided', () => {
    render(<LoadingState />);

    expect(document.querySelector('.loading-state .ant-spin')).not.toBeNull();
    expect(document.querySelector('.loading-state-label')).toBeNull();
  });
});
