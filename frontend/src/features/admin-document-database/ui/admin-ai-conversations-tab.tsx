// src/features/admin-document-database/ui/admin-ai-conversations-tab.tsx

import { useMemo, useState } from 'react';
import type { TableColumnsType } from 'antd';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Pagination,
  Select,
  Skeleton,
  Table,
  Tag,
} from 'antd';

import { formatDateTimeText } from '@/shared/ui/format-date-time';
import { StatusPill } from '@/shared/ui/status-pill';

import { useAdminAiConversationMessages } from '../application/use-admin-document-detail';
import { useAdminDocumentList } from '../application/use-admin-document-list';
import { useDebouncedValue } from '../application/use-debounced-value';
import type {
  AdminAiConversationListItem,
  AdminAiMessageListItem,
} from '../infrastructure/admin-document-database.types';
import { fetchAdminAiConversations } from '../infrastructure/admin-document-database-adapter';

import { AdminCreatedAtFilter } from './admin-created-at-filter';
import { type AdminCreatedAtRangeState, toAdminCreatedAtRange } from './admin-created-at-range';
import { AdminListStates } from './admin-list-states';

const CONVERSATION_STATUS_LABELS: Record<AdminAiConversationListItem['status'], string> = {
  ACTIVE: '进行中',
  COMPLETED: '已完成',
};

const MESSAGE_ROLE_LABELS: Record<AdminAiMessageListItem['role'], string> = {
  USER: '工程师',
  ASSISTANT: 'AI 助手',
  SYSTEM: '系统',
  TOOL: '工具',
};

const MESSAGE_ROLE_TAG_COLORS: Record<AdminAiMessageListItem['role'], string> = {
  USER: 'blue',
  ASSISTANT: 'green',
  SYSTEM: 'default',
  TOOL: 'orange',
};

/** AI 会话标签：全局会话列表 + 消息详情 Drawer（服务端按 messageSeq ASC + id ASC 稳定排序） */
export function AdminAiConversationsTab() {
  const [requestNoKeyword, setRequestNoKeyword] = useState('');
  const [engineerKeyword, setEngineerKeyword] = useState('');
  const [status, setStatus] = useState<AdminAiConversationListItem['status'] | undefined>(
    undefined,
  );
  const [createdAtRange, setCreatedAtRange] = useState<AdminCreatedAtRangeState>(null);
  const [messagesConversationId, setMessagesConversationId] = useState<number | null>(null);
  const [messagesPage, setMessagesPage] = useState(1);

  const debouncedRequestNo = useDebouncedValue(requestNoKeyword.trim());
  const debouncedEngineer = useDebouncedValue(engineerKeyword.trim());
  const timeFilter = toAdminCreatedAtRange(createdAtRange);

  const reloadKey = JSON.stringify({
    requestNo: debouncedRequestNo,
    engineerKeyword: debouncedEngineer,
    status,
    ...timeFilter,
  });
  const hasActiveFilter = reloadKey !== JSON.stringify({});

  const fetcher = useMemo(
    () => (page: number, pageSize: number) =>
      fetchAdminAiConversations(page, pageSize, {
        ...(debouncedRequestNo ? { requestNo: debouncedRequestNo } : {}),
        ...(debouncedEngineer ? { engineerKeyword: debouncedEngineer } : {}),
        ...(status ? { status } : {}),
        ...timeFilter,
      }),
    [debouncedRequestNo, debouncedEngineer, status, timeFilter],
  );

  const { state, goToPage, reload } = useAdminDocumentList<AdminAiConversationListItem>(
    fetcher,
    reloadKey,
    { failureMessage: 'AI 会话列表加载失败，请稍后重试。' },
  );
  const messages = useAdminAiConversationMessages(messagesConversationId, messagesPage);

  const columns = useMemo<TableColumnsType<AdminAiConversationListItem>>(
    () => [
      { dataIndex: 'requestNo', key: 'requestNo', title: '关联申请', width: 160 },
      { dataIndex: 'engineerNickname', key: 'engineerNickname', title: '工程师', width: 120 },
      {
        dataIndex: 'status',
        key: 'status',
        render: (value: AdminAiConversationListItem['status']) => (
          <StatusPill tone={value === 'ACTIVE' ? 'ok' : 'neutral'}>
            {CONVERSATION_STATUS_LABELS[value]}
          </StatusPill>
        ),
        title: '会话状态',
        width: 100,
      },
      { dataIndex: 'messageCount', key: 'messageCount', title: '消息数', width: 90 },
      { dataIndex: 'reportCount', key: 'reportCount', title: '报告数', width: 90 },
      {
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value: string) => formatDateTimeText(value),
        title: '创建时间',
        width: 170,
      },
      {
        dataIndex: 'completedAt',
        key: 'completedAt',
        render: (value: string | null) => (value ? formatDateTimeText(value) : '—'),
        title: '完成时间',
        width: 170,
      },
      {
        key: 'actions',
        render: (_value, record) => (
          <Button
            onClick={() => {
              setMessagesPage(1);
              setMessagesConversationId(record.id);
            }}
            size="small"
            type="link"
          >
            消息详情
          </Button>
        ),
        title: '操作',
        width: 100,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          allowClear
          placeholder="按关联申请编号搜索"
          style={{ width: 200 }}
          value={requestNoKeyword}
          onChange={(event) => setRequestNoKeyword(event.target.value)}
        />
        <Input
          allowClear
          placeholder="按工程师昵称/公司搜索"
          style={{ width: 200 }}
          value={engineerKeyword}
          onChange={(event) => setEngineerKeyword(event.target.value)}
        />
        <Select
          allowClear
          placeholder="会话状态"
          style={{ width: 130 }}
          value={status}
          onChange={(value) => setStatus(value)}
          options={Object.entries(CONVERSATION_STATUS_LABELS).map(([value, label]) => ({
            label,
            value,
          }))}
        />
        <AdminCreatedAtFilter onChange={setCreatedAtRange} value={createdAtRange} />
      </div>

      <AdminListStates
        emptyLabel="暂无 AI 会话。"
        filteredEmptyLabel="没有符合筛选条件的 AI 会话。"
        hasActiveFilter={hasActiveFilter}
        onRetry={reload}
        state={state}
      >
        {state.status === 'ready' && state.total > 0 ? (
          <div className="flex flex-col gap-4">
            <Table<AdminAiConversationListItem>
              columns={columns}
              dataSource={state.items}
              pagination={false}
              rowKey="id"
              scroll={{ x: 1180 }}
            />
            <div className="flex justify-end">
              <Pagination
                current={state.page}
                onChange={goToPage}
                pageSize={state.pageSize}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 条`}
                total={state.total}
              />
            </div>
          </div>
        ) : null}
      </AdminListStates>

      <Drawer
        destroyOnHidden
        onClose={() => setMessagesConversationId(null)}
        open={messagesConversationId !== null}
        title="会话消息详情"
        size="large"
      >
        {messages.state.status === 'loading' ? <Skeleton active /> : null}
        {messages.state.status === 'failed' ? (
          <Alert
            action={
              <Button onClick={messages.retry} size="small">
                重试
              </Button>
            }
            title={messages.state.message}
            showIcon
            type="error"
          />
        ) : null}
        {messages.state.status === 'ready' && messages.state.detail.total === 0 ? (
          <Empty description="该会话暂无消息。" />
        ) : null}
        {messages.state.status === 'ready' && messages.state.detail.total > 0 ? (
          <div className="flex flex-col gap-4">
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {messages.state.detail.items.map((message) => (
                <li
                  className="rounded border border-[var(--panel-border)] bg-[var(--filter-bar-bg)] p-3"
                  key={message.id}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Tag color={MESSAGE_ROLE_TAG_COLORS[message.role]}>
                      {MESSAGE_ROLE_LABELS[message.role]}
                    </Tag>
                    <span className="text-xs text-[var(--text-muted)]">
                      {message.turnNo !== null ? `第 ${message.turnNo} 轮 · ` : ''}
                      序号 {message.messageSeq} · {formatDateTimeText(message.createdAt)}
                    </span>
                  </div>
                  <p className="m-0 text-sm whitespace-pre-wrap">{message.contentText}</p>
                </li>
              ))}
            </ol>
            <div className="flex justify-end">
              <Pagination
                current={messages.state.detail.page}
                onChange={(page) => setMessagesPage(page)}
                pageSize={messages.state.detail.pageSize}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 条`}
                total={messages.state.detail.total}
              />
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
