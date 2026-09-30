// src/pages/customer/repair-request-detail/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户维修申请详情路由壳单测（PR5 整合工作台）。
 *
 * 壳只做 URL → requestId 的解析与注入（history-detail 模式）；详情加载状态机、
 * 删除命令与竞态守卫由工作台组合的 feature hook 承担，详情渲染由
 * customer-repair-request-detail-panel spec 覆盖，本 spec 只验证装配意图：
 * 数字参数原样注入、非数字与缺失参数统一归为 NaN（交详情 not-found 口径）。
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerRepairRequestDetailRoute } from './index';

const { useParamsMock } = vi.hoisted(() => ({ useParamsMock: vi.fn() }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useParams: () => useParamsMock() };
});

// 工作台用桩只记录装配 props：壳不复制工作台实现，只解析并注入 requestId
vi.mock('@/widgets/customer-repair-workspace', () => ({
  CustomerRepairWorkspace: ({ mode, requestId }: { mode: string; requestId?: number }) => (
    <div
      data-mode={mode}
      data-request-id={
        requestId === undefined ? 'none' : Number.isNaN(requestId) ? 'nan' : String(requestId)
      }
      data-testid="customer-repair-workspace"
    />
  ),
}));

const workspace = () => screen.getByTestId('customer-repair-workspace');

beforeEach(() => {
  useParamsMock.mockReset();
});

describe('客户维修申请详情路由壳', () => {
  it('URL 的 requestId 解析为数字并以 history-detail 模式注入工作台', () => {
    useParamsMock.mockReturnValue({ requestId: '920001' });

    render(<CustomerRepairRequestDetailRoute />);

    expect(workspace().getAttribute('data-mode')).toBe('history-detail');
    expect(workspace().getAttribute('data-request-id')).toBe('920001');
  });

  it('非数字 requestId 归为 NaN 注入（交详情统一 not-found 口径，与后端防探测一致）', () => {
    useParamsMock.mockReturnValue({ requestId: 'abc' });

    render(<CustomerRepairRequestDetailRoute />);

    expect(workspace().getAttribute('data-request-id')).toBe('nan');
  });

  it('缺失参数同样归为 NaN（防御性，不抛错）', () => {
    useParamsMock.mockReturnValue({});

    render(<CustomerRepairRequestDetailRoute />);

    expect(workspace().getAttribute('data-request-id')).toBe('nan');
  });
});
