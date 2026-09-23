// src/features/admin-document-database/ui/admin-ai-conversations-tab.spec.tsx
// @vitest-environment jsdom

/**
 * AI 会话 Tab 页面级测试（R3 + R4 + R7 S5）。
 *
 * R3/S5：主搜索在卡内工具区、各状态与表格分页同处 .kb-card 内、
 * 消息详情 Drawer 在卡外；筛选/分页/Drawer 可操作。
 * R4：默认空态「暂无 AI 会话。」、筛选空文案、会话状态枚举是有效筛选、
 * 请求参数与筛选状态一致。
 *
 * 只 mock 本 feature 的 adapter 模块，其余走真实组件与状态机。
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminAiConversationListItem,
  AdminAiMessageListItem,
  AdminListPage,
} from '../infrastructure/admin-document-database.types';
import {
  fetchAdminAiConversations,
  fetchAdminAiMessages,
} from '../infrastructure/admin-document-database-adapter';

import { AdminAiConversationsTab } from './admin-ai-conversations-tab';

vi.mock('../infrastructure/admin-document-database-adapter', async (importOriginal) => {
  type Adapter = typeof import('../infrastructure/admin-document-database-adapter');
  const actual = await importOriginal<Adapter>();

  return {
    ...actual,
    fetchAdminAiConversations: vi.fn(),
    fetchAdminAiMessages: vi.fn(),
  };
});

const fetchConversationsMock = vi.mocked(fetchAdminAiConversations);
const fetchMessagesMock = vi.mocked(fetchAdminAiMessages);

function buildConversationItem(id: number): AdminAiConversationListItem {
  return {
    id,
    requestNo: `RR-2026090${id}-001`,
    requestId: id,
    status: 'COMPLETED',
    engineerNickname: '陈工程师',
    messageCount: 12,
    reportCount: 1,
    createdAt: '2026-09-02T09:00:00.000Z',
    completedAt: '2026-09-02T10:00:00.000Z',
    aiFeedback: null,
  };
}

function buildMessageItem(id: number, seq: number): AdminAiMessageListItem {
  return {
    id,
    conversationId: 1,
    messageSeq: seq,
    turnNo: 1,
    role: 'ASSISTANT',
    contentText: `消息正文 ${seq}`,
    createdAt: '2026-09-02T09:05:00.000Z',
  };
}

function buildPage<T>(items: T[], total = items.length, page = 1): AdminListPage<T> {
  return { items, total, page, pageSize: 10 };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchConversationsMock.mockReset();
  fetchMessagesMock.mockReset();

  fetchConversationsMock.mockResolvedValue(buildPage([buildConversationItem(1)]));
  fetchMessagesMock.mockResolvedValue(buildPage([buildMessageItem(101, 1)]));
});

describe('AdminAiConversationsTab（R3/R7 S5 知识库卡容器）', () => {
  it('主搜索在卡内工具区，loading 骨架在同一知识库卡内', async () => {
    const { container } = render(<AdminAiConversationsTab />);

    const card = container.querySelector('.kb-card');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.table-container')).toBeNull();
    const toolbar = card?.querySelector('.kb-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.querySelector('input')).not.toBeNull();
    expect(card?.querySelector('.kb-card-state .ant-skeleton')).not.toBeNull();

    // flush 初始取数的落定，避免测试结束后才 dispatch 的 act 警告
    await act(async () => {});
  });

  it('有数据：表格与卡底分页在知识库卡内，消息详情 Drawer 在卡外且可打开', async () => {
    const { container } = render(<AdminAiConversationsTab />);

    expect(await screen.findByText('RR-20260901-001')).toBeInTheDocument();
    expect(screen.getByText('陈工程师')).toBeInTheDocument();
    const card = container.querySelector('.kb-card');
    expect(card?.querySelector('.kb-table-scope table')).not.toBeNull();
    expect(card?.querySelector('.kb-card-footer .ant-pagination')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '消息详情' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('消息正文 1')).toBeInTheDocument();
    expect(fetchMessagesMock).toHaveBeenCalledWith(1, 1, 50);
    expect(container.querySelector('.kb-card .ant-drawer')).toBeNull();
  });

  it('加载失败：错误告警在知识库卡内呈现，重试可恢复数据', async () => {
    fetchConversationsMock.mockRejectedValueOnce(new Error('network down'));
    const { container } = render(<AdminAiConversationsTab />);

    expect(await screen.findByText('AI 会话列表加载失败，请稍后重试。')).toBeInTheDocument();
    expect(container.querySelector('.kb-card .kb-card-state .ant-alert-error')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(await screen.findByText('RR-20260901-001')).toBeInTheDocument();
  });
});

describe('AdminAiConversationsTab（R4 有效筛选单一真源）', () => {
  it('默认空（无筛选）：显示「暂无 AI 会话。」而非筛选空文案，请求参数为空对象', async () => {
    fetchConversationsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiConversationsTab />);

    expect(await screen.findByText('暂无 AI 会话。')).toBeInTheDocument();
    expect(screen.queryByText('没有符合筛选条件的 AI 会话。')).toBeNull();
    expect(fetchConversationsMock).toHaveBeenCalledWith(1, 10, {});
  });

  it('真实筛选无结果：展开筛选后显示筛选空文案，请求变量保留筛选字段', async () => {
    fetchConversationsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiConversationsTab />);
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    fireEvent.change(screen.getByPlaceholderText('按工程师昵称/公司搜索'), {
      target: { value: '陈' },
    });

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchConversationsMock).toHaveBeenLastCalledWith(1, 10, { engineerKeyword: '陈' });
    expect(await screen.findByText('没有符合筛选条件的 AI 会话。')).toBeInTheDocument();
  });

  it('会话状态枚举是有效筛选，请求变量保留 status', async () => {
    fetchConversationsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiConversationsTab />);
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(await screen.findByText('已完成'));

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(fetchConversationsMock).toHaveBeenLastCalledWith(1, 10, { status: 'COMPLETED' });
    expect(await screen.findByText('没有符合筛选条件的 AI 会话。')).toBeInTheDocument();
  });

  it('筛选入口可展开/收起，重置清空全部条件回到空请求参数', async () => {
    fetchConversationsMock.mockResolvedValue(buildPage([]));
    render(<AdminAiConversationsTab />);
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(1));

    const filterButton = screen.getByRole('button', { name: '筛选' });
    expect(filterButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(filterButton);
    expect(filterButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(screen.getByPlaceholderText('按工程师昵称/公司搜索'), {
      target: { value: '陈' },
    });
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(2), { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(3), { timeout: 2000 });
    expect(fetchConversationsMock).toHaveBeenLastCalledWith(1, 10, {});
    expect(await screen.findByText('暂无 AI 会话。')).toBeInTheDocument();
  });

  it('分页可操作：翻页请求回带 page=2', async () => {
    fetchConversationsMock.mockResolvedValueOnce(buildPage([buildConversationItem(1)], 25, 1));
    fetchConversationsMock.mockResolvedValueOnce(buildPage([buildConversationItem(5)], 25, 2));
    const { container } = render(<AdminAiConversationsTab />);
    await screen.findByText('RR-20260901-001');

    const secondPage = container.querySelector('.ant-pagination-item-2 a');
    expect(secondPage).not.toBeNull();
    fireEvent.click(secondPage as HTMLElement);

    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(2));
    expect(fetchConversationsMock).toHaveBeenLastCalledWith(2, 10, {});
    expect(await screen.findByText('RR-20260905-001')).toBeInTheDocument();
  });
});
