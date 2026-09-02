// src/pages/engineer-repair-request-detail/index.spec.tsx
// @vitest-environment jsdom

/**
 * 工程师维修申请详情页「页面接线」测试。
 *
 * 职责划分（依赖规则的公开 API 约束）：
 * - 本文件只验证 page 层装配：会话角色 → canAccept 布尔、
 *   路由参数解析 → requestId（非法归一 null）、key 随参数隔离重建；
 *   仅 mock 公开 barrel（@/features/repair-request）与 auth-session 边界，
 *   不触碰 feature 内部（infrastructure/application）模块。
 * - 详情加载、接单流程、冲突反馈等行为职责在 feature 层测试：
 *   ui/engineer-repair-request-detail-panel.spec.tsx、
 *   application/use-engineer-repair-request-detail-flow.spec.ts、
 *   application/use-engineer-repair-request-detail.spec.ts、
 *   infrastructure/engineer-repair-request-adapter.spec.ts。
 * - 浏览器全链路行为由 e2e/engineer-repair-request-flow.spec.ts 覆盖。
 */

import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EngineerRepairRequestDetailPage } from './index';

const { navigateMock, useParamsMock, authSessionViewMock, panelMountLog } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useParamsMock: vi.fn(),
  authSessionViewMock: vi.fn(),
  panelMountLog: [] as Array<{ canAccept: boolean; requestId: number | null }>,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock, useParams: () => useParamsMock() };
});

// 只提供会话角色输入（与客户首页测试同一先例），放行判断等其余实现保留真实
vi.mock('@/features/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth-session')>();

  return { ...actual, useAuthSession: () => authSessionViewMock() };
});

// 只 mock feature 公开 barrel 的面板出口：接线测试不深入 feature 内部模块
vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  function PanelStub(props: { canAccept: boolean; requestId: number | null }) {
    const { canAccept, requestId } = props;
    // 仅在挂载时记录：key 变化触发重挂载，log 长度即可区分重建与复用
    useEffect(() => {
      panelMountLog.push({ canAccept, requestId });
    }, [canAccept, requestId]);

    return null;
  }

  return { ...actual, EngineerRepairRequestDetailPanel: PanelStub };
});

type SessionRole = 'CUSTOMER' | 'ENGINEER' | 'SUPER_ADMIN';

function setRole(role: SessionRole) {
  authSessionViewMock.mockReturnValue({
    session: { accountId: 900101, role, userInfo: null },
    status: 'authenticated',
  });
}

function setRouteParam(requestId: string | undefined) {
  useParamsMock.mockReturnValue({ requestId });
}

beforeEach(() => {
  panelMountLog.length = 0;
  navigateMock.mockReset();
  useParamsMock.mockReset();
  authSessionViewMock.mockReset();
});

describe('页面接线：会话角色 → canAccept', () => {
  it('ENGINEER 可接单：canAccept=true 传入面板', () => {
    setRole('ENGINEER');
    setRouteParam('21');

    render(<EngineerRepairRequestDetailPage />);

    expect(panelMountLog).toEqual([{ canAccept: true, requestId: 21 }]);
  });

  it('SUPER_ADMIN 只读：面板仍装配，但 canAccept=false（读权限继承不等于接单权限）', () => {
    setRole('SUPER_ADMIN');
    setRouteParam('21');

    render(<EngineerRepairRequestDetailPage />);

    expect(panelMountLog).toEqual([{ canAccept: false, requestId: 21 }]);
  });

  it('CUSTOMER 同样 canAccept=false，判断由页面生产代码决定', () => {
    setRole('CUSTOMER');
    setRouteParam('21');

    render(<EngineerRepairRequestDetailPage />);

    expect(panelMountLog).toEqual([{ canAccept: false, requestId: 21 }]);
  });
});

describe('页面接线：路由参数解析', () => {
  it.each([
    ['非正整数归一为 null（0）', '0', null],
    ['负数归一为 null', '-3', null],
    ['非数字归一为 null', 'abc', null],
    ['缺失归一为 null', undefined, null],
  ])('%s', (_label, raw, expected) => {
    setRole('ENGINEER');
    setRouteParam(raw);

    render(<EngineerRepairRequestDetailPage />);

    expect(panelMountLog).toEqual([{ canAccept: true, requestId: expected }]);
  });

  it('页面标题来自 PageHeader 装配', () => {
    setRole('ENGINEER');
    setRouteParam('21');

    render(<EngineerRepairRequestDetailPage />);

    expect(screen.getByText('维修申请详情')).toBeTruthy();
  });
});

describe('页面接线：key 随路由参数隔离重建', () => {
  it('参数直接变化时重挂载面板，上一申请的实例状态不带到下一申请', () => {
    setRole('ENGINEER');
    setRouteParam('21');

    const { rerender } = render(<EngineerRepairRequestDetailPage />);
    expect(panelMountLog).toEqual([{ canAccept: true, requestId: 21 }]);

    // 同一路由由 21 直接切到 22（不经返回列表重新挂载）
    setRouteParam('22');
    rerender(<EngineerRepairRequestDetailPage />);

    // 重挂载产生第二条挂载记录，且新实例拿到新参数
    expect(panelMountLog).toEqual([
      { canAccept: true, requestId: 21 },
      { canAccept: true, requestId: 22 },
    ]);
  });
});
