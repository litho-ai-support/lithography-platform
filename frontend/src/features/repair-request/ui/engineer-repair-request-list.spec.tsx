// src/features/repair-request/ui/engineer-repair-request-list.spec.tsx
// @vitest-environment jsdom

/**
 * 工程师列表面板 UI 单测。
 *
 * 走真实面板 + 真实列表 query 状态机，只 mock 外部 GraphQL adapter 与路由跳转；
 * scope 取值、空态文案与分页行为均由生产组件决定，测试不复制规则。
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLIngressError } from '@/shared/graphql';

import type {
  EngineerRepairRequestListItem,
  EngineerRepairRequestPage,
} from '../infrastructure/engineer-repair-request.types';
import * as engineerRepairRequestAdapter from '../infrastructure/engineer-repair-request-adapter';

import { EngineerRepairRequestList } from './engineer-repair-request-list';

vi.mock('../infrastructure/engineer-repair-request-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof engineerRepairRequestAdapter>();

  return {
    ...actual,
    fetchEngineerRepairRequests: vi.fn(),
  };
});

const navigateMock = vi.fn();

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return { ...actual, useNavigate: () => navigateMock };
});

const fetchMock = vi.mocked(engineerRepairRequestAdapter.fetchEngineerRepairRequests);

function buildItem(id: number, isAccepted = false): EngineerRepairRequestListItem {
  return {
    id,
    requestNo: `RR20260902100000ABC${id}`,
    equipmentModel: { id: 3, modelCode: 'LITHO-9000', modelName: '光刻机 9000' },
    errorCode: 'E-100',
    createdAt: '2026-09-02T08:00:00.000Z',
    isAccepted,
    acceptedAt: isAccepted ? '2026-09-02T08:30:00.000Z' : null,
    latestResolutionStatus: isAccepted ? 'PENDING' : null,
  };
}

function buildPage(
  items: EngineerRepairRequestListItem[],
  total = items.length,
  page = 1,
  pageSize = 10,
): EngineerRepairRequestPage {
  return { items, total, page, pageSize };
}

beforeEach(() => {
  fetchMock.mockReset();
  navigateMock.mockReset();
});

describe('EngineerRepairRequestList', () => {
  it('加载中展示骨架屏，就绪后展示列表行', async () => {
    let resolveList: (value: EngineerRepairRequestPage) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<EngineerRepairRequestPage>((resolve) => {
        resolveList = resolve;
      }),
    );

    render(<EngineerRepairRequestList />);

    expect(document.querySelector('.ant-skeleton')).toBeTruthy();
    expect(screen.queryByText('RR20260902100000ABC21')).toBeNull();

    await act(async () => {
      resolveList(buildPage([buildItem(21)]));
    });

    await screen.findByText('RR20260902100000ABC21');
    expect(document.querySelector('.ant-skeleton')).toBeNull();
    expect(screen.getByText('光刻机 9000（LITHO-9000）')).toBeTruthy();
    // 状态标签：“待接单”同时是 Segmented 选项文案，故按标签元素断言
    const tagTexts = Array.from(document.querySelectorAll('.ant-tag')).map(
      (tag) => tag.textContent,
    );
    expect(tagTexts).toContain('待接单');
    expect(screen.getByText('暂无回复')).toBeTruthy();
    expect(screen.getByText('共 1 条')).toBeTruthy();
  });

  it.each([
    ['AVAILABLE', '暂无待接单的维修申请。'],
    ['MINE', '暂无你的接单记录。'],
  ])('%s 范围为空时展示该范围专属空态', async (scope, emptyText) => {
    fetchMock.mockResolvedValue(buildPage([], 0));

    render(<EngineerRepairRequestList />);

    if (scope === 'MINE') {
      fireEvent.click(screen.getByText('我的接单'));
    }

    await screen.findByText(emptyText);
    expect(fetchMock).toHaveBeenLastCalledWith({ scope, page: 1, pageSize: 10 });
    // 空态互斥：不得同时展示另一个范围的空文案
    const otherScopeEmptyText =
      scope === 'AVAILABLE' ? '暂无你的接单记录。' : '暂无待接单的维修申请。';
    expect(screen.queryByText(otherScopeEmptyText)).toBeNull();
  });

  it('切换到「我的接单」后回到第 1 页并按 MINE 请求', async () => {
    fetchMock.mockResolvedValue(buildPage([buildItem(21, true)], 12));

    render(<EngineerRepairRequestList />);
    await screen.findByText('RR20260902100000ABC21');

    // 先在待接单范围翻页，再切换范围：页码必须重置为 1
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'AVAILABLE', page: 2, pageSize: 10 }),
    );

    fireEvent.click(screen.getByText('我的接单'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'MINE', page: 1, pageSize: 10 }),
    );
  });

  it('加载失败展示共享错误文案与重试入口，重试沿用当前范围与页码', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    fetchMock.mockRejectedValueOnce(networkError);

    render(<EngineerRepairRequestList />);

    await screen.findByText(networkError.userMessage);
    expect(screen.queryByText('暂无待接单的维修申请。')).toBeNull();

    fetchMock.mockResolvedValueOnce(buildPage([buildItem(22)]));
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    await screen.findByText('RR20260902100000ABC22');
    expect(fetchMock).toHaveBeenLastCalledWith({ scope: 'AVAILABLE', page: 1, pageSize: 10 });
  });

  it('点击列表行进入该申请的工程师详情路由', async () => {
    fetchMock.mockResolvedValue(buildPage([buildItem(21), buildItem(22)]));

    render(<EngineerRepairRequestList />);
    await screen.findByText('RR20260902100000ABC22');

    fireEvent.click(screen.getByText('RR20260902100000ABC22'));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/engineer/repair-requests/22');
  });

  it('当前页为空但范围非空时保留分页器，不形成死路', async () => {
    fetchMock.mockResolvedValue(buildPage([buildItem(21)], 12));

    render(<EngineerRepairRequestList />);
    await screen.findByText('RR20260902100000ABC21');

    fetchMock.mockResolvedValueOnce(buildPage([], 12, 2));
    fireEvent.click(screen.getByTitle('2'));

    await screen.findByText('当前页暂无数据，请翻页返回。');
    expect(screen.getByText('共 12 条')).toBeTruthy();
    expect(screen.getByTitle('1')).toBeTruthy();
  });
});
