// src/pages/customer/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户首页路由壳单测（PR5 整合工作台）。
 *
 * 首页只选择工作台模式（create）；固定页头、模式装配与表单协作端口由
 * widgets/customer-repair-workspace 的 spec 覆盖，本 spec 只验证壳的装配意图：
 * 单一工作台实例、create 模式与 barrel 对 router 的路由组件导出。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CustomerPage,
  CustomerRepairRequestDetailRoute,
  CustomerRepairRequestsPage,
} from './index';

// 工作台用桩只记录装配 props：壳不复制工作台实现，只传模式
vi.mock('@/widgets/customer-repair-workspace', () => ({
  CustomerRepairWorkspace: ({ mode }: { mode: string }) => (
    <div data-mode={mode} data-testid="customer-repair-workspace" />
  ),
}));

describe('客户首页壳', () => {
  it('以 create 模式装配唯一的工作台实例', () => {
    render(<CustomerPage />);

    const workspaces = screen.getAllByTestId('customer-repair-workspace');
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].getAttribute('data-mode')).toBe('create');
  });

  // app/router 经本 barrel 引用三个路由组件（跨模块只走公开出口）
  it('barrel 为 router 提供列表与详情路由组件导出', () => {
    expect(typeof CustomerRepairRequestDetailRoute).toBe('function');
    expect(typeof CustomerRepairRequestsPage).toBe('function');
  });
});
