// src/pages/customer/repair-request-detail/index.spec.tsx
// @vitest-environment jsdom

/**
 * 客户维修申请详情路由壳单测（PR5 整合工作台，2026-10-02 复审重写）。
 *
 * 壳只做 URL → requestId 的解析与注入（history-detail 模式）：解析结果必须是
 * 「有效正整数 | null」，NaN / 小数 / 上溢等非法值绝不进入工作台（历史事故：NaN
 * 注入触发详情 hook 渲染期 setState 死循环）。旧版「NaN 注入即已验收」的断言已删除：
 * 它只验证了错误值被传递下去，不能作为 not-found 证据——真实组合链路的证据在
 * index.composition.spec.tsx。
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerRepairRequestDetailRoute } from './index';
import { parseRepairRequestIdParam } from './repair-request-id-param';

const { useParamsMock } = vi.hoisted(() => ({ useParamsMock: vi.fn() }));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useParams: () => useParamsMock() };
});

// 工作台用桩只记录装配 props：壳不复制工作台实现，只解析并注入 requestId
vi.mock('@/widgets/customer-repair-workspace', () => ({
  CustomerRepairWorkspace: ({ mode, requestId }: { mode: string; requestId?: number | null }) => (
    <div
      data-mode={mode}
      data-request-id={requestId === undefined || requestId === null ? 'null' : String(requestId)}
      data-testid="customer-repair-workspace"
    />
  ),
}));

const workspace = () => screen.getByTestId('customer-repair-workspace');

beforeEach(() => {
  useParamsMock.mockReset();
});

describe('parseRepairRequestIdParam 的边界矩阵', () => {
  it.each([
    ['1', 1],
    ['920001', 920001],
    ['2147483647', 2_147_483_647],
  ])('规范十进制正整数 %p 解析为 %p', (raw, expected) => {
    expect(parseRepairRequestIdParam(raw)).toBe(expected);
  });

  it.each([
    ['abc'],
    [''],
    [' '],
    [' 920001 '],
    ['0'],
    ['-1'],
    ['+1'],
    ['1.5'],
    ['1e3'],
    ['0x10'],
    ['007'],
    ['Infinity'],
    ['NaN'],
    ['2147483648'],
    ['99999999999999999999999'],
    [undefined],
  ])('非法参数 %p 归为 null', (raw) => {
    expect(parseRepairRequestIdParam(raw)).toBeNull();
  });
});

describe('客户维修申请详情路由壳', () => {
  it('URL 的 requestId 解析为数字并以 history-detail 模式注入工作台', () => {
    useParamsMock.mockReturnValue({ requestId: '920001' });

    render(<CustomerRepairRequestDetailRoute />);

    expect(workspace().getAttribute('data-mode')).toBe('history-detail');
    expect(workspace().getAttribute('data-request-id')).toBe('920001');
  });

  it.each([['abc'], ['0'], ['-1'], ['1.5'], ['2147483648']])(
    '非法 requestId %p 以 null 注入（交工作台统一 not-found，不再传 NaN）',
    (raw) => {
      useParamsMock.mockReturnValue({ requestId: raw });

      render(<CustomerRepairRequestDetailRoute />);

      expect(workspace().getAttribute('data-request-id')).toBe('null');
    },
  );

  it('缺失参数同样以 null 注入（防御性，不抛错）', () => {
    useParamsMock.mockReturnValue({});

    render(<CustomerRepairRequestDetailRoute />);

    expect(workspace().getAttribute('data-request-id')).toBe('null');
  });
});
