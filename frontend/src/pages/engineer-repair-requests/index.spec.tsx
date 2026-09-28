// src/pages/engineer-repair-requests/index.spec.tsx
// @vitest-environment jsdom

/**
 * 工程师维修申请列表页「页面接线」测试。
 *
 * 只验证 page 层装配：查询参数 scope → initialScope（仅接受后端四态合法值，
 * 非法值回落 undefined 由 feature 默认 ALL）；列表行为在 feature 层测试覆盖。
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EngineerRepairRequestsPage } from './index';

const { searchParamsMock, listPropsLog } = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  listPropsLog: [] as Array<{ initialScope: string | undefined }>,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useSearchParams: () => searchParamsMock() };
});

vi.mock('@/features/repair-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/repair-request')>();

  function ListStub(props: { initialScope?: string | undefined }) {
    listPropsLog.push({ initialScope: props.initialScope });

    return null;
  }

  return { ...actual, EngineerRepairRequestList: ListStub };
});

function setScopeParam(raw: string | null) {
  // useSearchParams 返回 [URLSearchParams, setter]；raw 为 null 表示无查询串
  searchParamsMock.mockReturnValue([new URLSearchParams(raw ?? ''), vi.fn()]);
}

beforeEach(() => {
  listPropsLog.length = 0;
  searchParamsMock.mockReset();
});

describe('EngineerRepairRequestsPage', () => {
  it('无 scope 参数时 initialScope 为 undefined（feature 默认 ALL）', () => {
    setScopeParam(null);

    render(<EngineerRepairRequestsPage />);

    expect(listPropsLog).toEqual([{ initialScope: undefined }]);
    expect(screen.getByText('工程师维修申请')).toBeTruthy();
  });

  it.each([
    ['ALL', '?scope=ALL'],
    ['AVAILABLE', '?scope=AVAILABLE'],
    ['MINE', '?scope=MINE'],
    ['TAKEN_BY_OTHER', '?scope=TAKEN_BY_OTHER'],
  ])('scope=%s 合法时作为 initialScope 传入', (expected, raw) => {
    setScopeParam(raw);

    render(<EngineerRepairRequestsPage />);

    expect(listPropsLog).toEqual([{ initialScope: expected }]);
  });

  it.each(['?scope=OTHER', '?scope=mine', '?scope='])(
    '非法 scope 参数 %s 回落 undefined',
    (raw) => {
      setScopeParam(raw);

      render(<EngineerRepairRequestsPage />);

      expect(listPropsLog).toEqual([{ initialScope: undefined }]);
    },
  );
});
