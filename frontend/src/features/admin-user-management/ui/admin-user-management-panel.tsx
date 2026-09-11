// src/features/admin-user-management/ui/admin-user-management-panel.tsx

import { useState } from 'react';
import { Alert, Button, Input, message, Select, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type {
  AdminUserCommandResult,
  AdminUserCreateDraft,
  AdminUserProfileEditDraft,
  AdminUserRole,
  AdminUserRow,
  AdminUserStatusFilter,
  AdminUserWritableRole,
} from '../application/admin-user-management.types';
import {
  ADMIN_USER_ROLE_FILTER_OPTIONS,
  ADMIN_USER_ROLE_LABELS,
  ADMIN_USER_ROW_READ_ONLY_REASON,
  ADMIN_USER_STATUS_FILTER_OPTIONS,
  ADMIN_USER_STATUS_LABELS,
  canChangeAdminUserRole,
  canEditAdminUserProfile,
  canResetAdminUserPassword,
  canToggleAdminUserStatus,
  isAdminUserStatusWritable,
} from '../application/admin-user-management-policy';
import { useAdminUserCommands } from '../application/use-admin-user-commands';
import { useAdminUserList } from '../application/use-admin-user-list';

import { AdminUserCreateModal } from './admin-user-create-modal';
import {
  AdminUserProfileEditModal,
  AdminUserResetPasswordModal,
  AdminUserRoleModal,
  AdminUserStatusModal,
} from './admin-user-row-command-modals';

const ROLE_TAG_COLORS: Record<AdminUserRole, string> = {
  CUSTOMER: 'green',
  ENGINEER: 'blue',
  SUPER_ADMIN: 'gold',
};

/** 展示时间的切片内唯一实现；解析失败时占位，不展示原始值误导用户 */
function formatDateTimeText(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function renderOptionalText(value: string | null): string {
  return value ?? '—';
}

export function AdminUserManagementPanel() {
  const list = useAdminUserList();
  const commands = useAdminUserCommands(list.reload);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [profileRow, setProfileRow] = useState<AdminUserRow | null>(null);
  const [roleRow, setRoleRow] = useState<AdminUserRow | null>(null);
  const [statusRow, setStatusRow] = useState<AdminUserRow | null>(null);
  const [resetPasswordRow, setResetPasswordRow] = useState<AdminUserRow | null>(null);

  const isCreateSubmitting = commands.isPending('create');
  const isProfileSubmitting = commands.isPending('profile');
  const isRoleSubmitting = commands.isPending('role');
  const isStatusSubmitting = commands.isPending('status');
  const isResetPasswordSubmitting = commands.isPending('reset-password');

  const submitCreate = async (draft: AdminUserCreateDraft): Promise<AdminUserCommandResult> => {
    const execution = await commands.createUser(draft);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        message.success('用户已创建。');
        setCreateOpen(false);
      }

      return execution.result;
    }

    if (execution.kind === 'unhandled-error') {
      // 未分类失败同样回传 message，由弹窗内既有 Alert 持久展示，
      // 不再叠加一次性 toast（in-flight 不会到达：提交按钮已 loading）
      return { ok: false, reason: 'creation-failed', message: execution.message };
    }

    return { ok: false, reason: 'creation-failed', message: '' };
  };

  const submitProfileEdit = async (
    draft: AdminUserProfileEditDraft,
  ): Promise<AdminUserCommandResult> => {
    const execution = await commands.updateUserProfile(draft);

    if (execution.kind === 'ok' && execution.result.ok) {
      message.success('资料已更新。');
      setProfileRow(null);

      return execution.result;
    }

    if (execution.kind === 'unhandled-error') {
      return { ok: false, reason: 'update-failed', message: execution.message };
    }

    return { ok: false, reason: 'update-failed', message: '' };
  };

  const submitRoleChange = async (input: {
    accountId: number;
    role: AdminUserWritableRole;
  }): Promise<AdminUserCommandResult> => {
    const execution = await commands.changeUserRole(input);

    if (execution.kind === 'ok' && execution.result.ok) {
      message.success('角色已修改。');
      setRoleRow(null);

      return execution.result;
    }

    if (execution.kind === 'unhandled-error') {
      return { ok: false, reason: 'update-failed', message: execution.message };
    }

    return { ok: false, reason: 'update-failed', message: '' };
  };

  const submitStatusChange = async (input: {
    accountId: number;
    status: AdminUserStatusFilter;
  }): Promise<AdminUserCommandResult> => {
    const execution = await commands.setUserStatus(input);

    if (execution.kind === 'ok' && execution.result.ok) {
      message.success('状态已修改。');
      setStatusRow(null);

      return execution.result;
    }

    if (execution.kind === 'unhandled-error') {
      return { ok: false, reason: 'update-failed', message: execution.message };
    }

    return { ok: false, reason: 'update-failed', message: '' };
  };

  const submitPasswordReset = async (input: {
    accountId: number;
    newPassword: string;
  }): Promise<AdminUserCommandResult> => {
    const execution = await commands.resetUserPassword(input);

    if (execution.kind === 'ok' && execution.result.ok) {
      // 成功提示只展示后端固定安全提示 notice，密码不出现在任何反馈中
      message.success(execution.result.notice, 6);
      setResetPasswordRow(null);

      return { ok: true };
    }

    if (execution.kind === 'unhandled-error') {
      return { ok: false, reason: 'reset-failed', message: execution.message };
    }

    return { ok: false, reason: 'reset-failed', message: '' };
  };

  const columns: ColumnsType<AdminUserRow> = [
    { dataIndex: 'accountId', title: 'ID', width: 64 },
    { dataIndex: 'nickname', ellipsis: true, title: '昵称' },
    {
      dataIndex: 'loginName',
      ellipsis: true,
      render: renderOptionalText,
      title: '登录名',
    },
    {
      dataIndex: 'loginEmail',
      ellipsis: true,
      render: renderOptionalText,
      title: '登录邮箱',
    },
    {
      dataIndex: 'contactEmail',
      ellipsis: true,
      render: renderOptionalText,
      title: '联系邮箱',
    },
    {
      dataIndex: 'companyName',
      ellipsis: true,
      render: renderOptionalText,
      title: '公司名称',
    },
    {
      dataIndex: 'phone',
      ellipsis: true,
      render: renderOptionalText,
      title: '电话',
    },
    {
      dataIndex: 'role',
      render: (role: AdminUserRole) => (
        <Tag color={ROLE_TAG_COLORS[role]}>{ADMIN_USER_ROLE_LABELS[role]}</Tag>
      ),
      title: '角色',
      width: 110,
    },
    {
      dataIndex: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'success' : 'default'}>
          {isAdminUserStatusWritable(status) ? ADMIN_USER_STATUS_LABELS[status] : status}
        </Tag>
      ),
      title: '状态',
      width: 100,
    },
    {
      dataIndex: 'createdAt',
      render: formatDateTimeText,
      title: '创建时间',
      width: 160,
    },
    {
      dataIndex: 'updatedAt',
      render: formatDateTimeText,
      title: '最近变更',
      width: 160,
    },
    {
      fixed: 'right',
      render: (_, row) => {
        const readOnly = !canEditAdminUserProfile(row);
        const actionButtons = [
          {
            disabled: readOnly,
            key: 'profile',
            label: '编辑资料',
            onClick: () => setProfileRow(row),
          },
          {
            disabled: !canChangeAdminUserRole(row),
            key: 'role',
            label: '角色',
            onClick: () => setRoleRow(row),
          },
          {
            disabled: !canToggleAdminUserStatus(row),
            key: 'status',
            label: '启停',
            onClick: () => setStatusRow(row),
          },
          {
            disabled: !canResetAdminUserPassword(row),
            key: 'reset-password',
            label: '重置密码',
            onClick: () => setResetPasswordRow(row),
          },
        ];

        const buttons = (
          <Space size={0} wrap>
            {actionButtons.map((action) => (
              <Button
                disabled={action.disabled}
                key={action.key}
                size="small"
                type="link"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </Space>
        );

        // SUPER_ADMIN 行只读：写入口禁用并给出可理解说明（后端仍是权限真源）
        return readOnly ? (
          <Tooltip title={ADMIN_USER_ROW_READ_ONLY_REASON}>{buttons}</Tooltip>
        ) : (
          buttons
        );
      },
      title: '操作',
      width: 280,
    },
  ];

  const state = list.state;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-72">
          <Input.Search
            allowClear
            enterButton="搜索"
            placeholder="搜索登录名 / 登录邮箱 / 昵称"
            style={{ width: '100%' }}
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onSearch={(value) => list.applyFilters({ keyword: value.trim() || null })}
          />
        </div>

        <div className="w-44">
          <Select<AdminUserRole | undefined>
            allowClear
            placeholder="角色筛选"
            style={{ width: '100%' }}
            value={list.query.role ?? undefined}
            onChange={(role) => list.applyFilters({ role: role ?? null })}
            options={ADMIN_USER_ROLE_FILTER_OPTIONS.map((role) => ({
              value: role,
              label: ADMIN_USER_ROLE_LABELS[role],
            }))}
          />
        </div>

        <div className="w-36">
          <Select<AdminUserStatusFilter | undefined>
            allowClear
            placeholder="状态筛选"
            style={{ width: '100%' }}
            value={list.query.status ?? undefined}
            onChange={(status) => list.applyFilters({ status: status ?? null })}
            options={ADMIN_USER_STATUS_FILTER_OPTIONS.map((status) => ({
              value: status,
              label: ADMIN_USER_STATUS_LABELS[status],
            }))}
          />
        </div>

        <div className="flex-1" />

        <Button type="primary" onClick={() => setCreateOpen(true)}>
          创建用户
        </Button>
      </div>

      {state.status === 'failed' ? (
        <Alert
          action={
            <Button size="small" type="primary" onClick={list.reload}>
              重试
            </Button>
          }
          message={state.message}
          showIcon
          type="error"
        />
      ) : null}

      <Table<AdminUserRow>
        columns={columns}
        dataSource={state.status === 'ready' && list.isCurrentQueryDomain ? state.page.items : []}
        loading={state.status === 'loading' || !list.isCurrentQueryDomain}
        locale={{
          emptyText: state.status === 'failed' ? '请求失败，请重试。' : '暂无用户数据。',
        }}
        pagination={{
          current:
            state.status === 'ready' && list.isCurrentQueryDomain
              ? state.page.page
              : list.query.page,
          onChange: list.goToPage,
          pageSize: list.query.pageSize,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
          // 只展示当前查询域的最近成功 total；筛选域切换后立即归零
          total: list.isCurrentQueryDomain ? state.lastTotal : 0,
        }}
        rowKey="accountId"
        scroll={{ x: 1280 }}
        size="middle"
      />

      <AdminUserCreateModal
        open={createOpen}
        submitting={isCreateSubmitting}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      />

      <AdminUserProfileEditModal
        row={profileRow}
        submitting={isProfileSubmitting}
        onCancel={() => setProfileRow(null)}
        onSubmit={submitProfileEdit}
      />

      <AdminUserRoleModal
        row={roleRow}
        submitting={isRoleSubmitting}
        onCancel={() => setRoleRow(null)}
        onSubmit={submitRoleChange}
      />

      <AdminUserStatusModal
        row={statusRow}
        submitting={isStatusSubmitting}
        onCancel={() => setStatusRow(null)}
        onSubmit={submitStatusChange}
      />

      <AdminUserResetPasswordModal
        row={resetPasswordRow}
        submitting={isResetPasswordSubmitting}
        onCancel={() => setResetPasswordRow(null)}
        onSubmit={submitPasswordReset}
      />
    </div>
  );
}
