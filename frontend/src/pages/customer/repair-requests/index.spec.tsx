// src/pages/customer/repair-requests/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户「我的维修申请」历史列表路由壳单测（PR5 整合工作台）。
 *
 * 壳只选择工作台模式（history-list）；列表渲染、分页、删除与选中联动全部由
 * CustomerRepairWorkspace 组合 feature 状态机完成，工作台内部行为由
 * widgets/customer-repair-workspace 的 spec 覆盖，本 spec 只验证装配意图。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomerRepairRequestsPage } from './index';

// 工作台用桩只记录装配 props：壳不复制工作台实现，只传模式
vi.mock('@/widgets/customer-repair-workspace', () => ({
  CustomerRepairWorkspace: ({ mode }: { mode: string }) => (
    <div data-mode={mode} data-testid="customer-repair-workspace" />
  ),
}));

describe('客户「我的维修申请」列表路由壳', () => {
  it('以 history-list 模式装配唯一的工作台实例', () => {
    render(<CustomerRepairRequestsPage />);

    const workspaces = screen.getAllByTestId('customer-repair-workspace');
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].getAttribute('data-mode')).toBe('history-list');
  });
});
