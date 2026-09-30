// src/pages/repair-request-create/index.spec.tsx
// @vitest-environment jsdom

/**
 * 创建维修申请兼容入口路由壳单测（PR5 整合工作台）。
 *
 * 本路由（/customer/repair-requests/new）与客户首页默认态渲染完全一致的
 * create 态工作台（不生成第二标题、不复制表单实现）；工作台内部行为由
 * widgets/customer-repair-workspace 的 spec 覆盖，本 spec 只验证装配意图。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RepairRequestCreatePage } from './index';

// 工作台用桩只记录装配 props：壳不复制工作台实现，只传模式
vi.mock('@/widgets/customer-repair-workspace', () => ({
  CustomerRepairWorkspace: ({ mode }: { mode: string }) => (
    <div data-mode={mode} data-testid="customer-repair-workspace" />
  ),
}));

describe('创建维修申请兼容入口路由壳', () => {
  it('以 create 模式装配唯一的工作台实例', () => {
    render(<RepairRequestCreatePage />);

    const workspaces = screen.getAllByTestId('customer-repair-workspace');
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].getAttribute('data-mode')).toBe('create');
  });
});
