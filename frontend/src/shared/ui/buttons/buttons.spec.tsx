// src/shared/ui/buttons/buttons.spec.tsx

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DangerButton, PrimaryButton, SecondaryButton } from './index';

describe('公共按钮出口', () => {
  afterEach(() => {
    cleanup();
  });

  it('PrimaryButton 渲染 antd 主按钮', () => {
    render(<PrimaryButton>主操作</PrimaryButton>);

    expect(screen.getByText('主操作').closest('button')).toHaveClass('ant-btn-primary');
  });

  it('SecondaryButton 渲染 antd 次按钮（默认型）', () => {
    render(<SecondaryButton>次操作</SecondaryButton>);

    const button = screen.getByText('次操作').closest('button');

    expect(button).toHaveClass('ant-btn-default');
    expect(button).not.toHaveClass('ant-btn-primary');
  });

  it('DangerButton 渲染 antd 危险主按钮', () => {
    render(<DangerButton>危险操作</DangerButton>);

    expect(screen.getByText('危险操作').closest('button')).toHaveClass(
      'ant-btn-primary',
      'ant-btn-dangerous',
    );
  });

  it('透传附加 props（如 disabled）', () => {
    render(<PrimaryButton disabled>禁用主按钮</PrimaryButton>);

    expect(screen.getByText('禁用主按钮').closest('button')).toBeDisabled();
  });
});
