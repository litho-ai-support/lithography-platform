// src/features/admin-user-management/ui/admin-user-management-panel.tsx

/**
 * 管理员用户管理面板。
 *
 * 五个写弹窗都恒定挂载在本组件中、只切换 `open` / `row`，因此弹窗归属判定集中在这一层：
 * 每个弹窗一条**会话代次**（`useDialogSessionSeq`），打开 / 关闭 / 切换目标时在事件处理器里
 * 同步推进，提交入口捕获代次与目标 accountId，成功续体回来后代次与 accountId 都仍一致才允许关闭。
 * 弹窗内部的错误区另由弹窗侧的 `useStaleSubmitGuard` 把守，两层互不代替。
 */

import { type Dispatch, type SetStateAction, useState } from 'react';
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
import { useDialogSessionSeq } from './use-dialog-session-seq';

const ROLE_TAG_COLORS: Record<AdminUserRole, string> = {
  CUSTOMER: 'green',
  ENGINEER: 'blue',
  SUPER_ADMIN: 'gold',
};

/** 四个行级弹窗的会话标识（都以目标 accountId 为身份） */
type AdminUserRowDialogKey = 'profile' | 'role' | 'status' | 'reset-password';

/** 五个弹窗的会话标识：创建弹窗没有 accountId，会话代次就是它的完整身份 */
type AdminUserDialogKey = AdminUserRowDialogKey | 'create';

type AdminUserRowSetter = Dispatch<SetStateAction<AdminUserRow | null>>;

/** 展示时间的切片内唯一实现；解析失败时占位，不展示原始值误导用户 */
function formatDateTimeText(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

function renderOptionalText(value: string | null): string {
  return value ?? '—';
}

/**
 * 陈旧成功的反馈措辞：写入确实发生，因此仍然给成功提示，
 * 但必须点名**实际提交的目标**，否则在另一个弹窗正打开时会被误读成当前目标的结果。
 * 昵称不可得时退化为不含目标的通用准确表述（与新鲜成功同一句）。
 */
function toTargetedSuccessMessage(nickname: string | null, noun: string, verb: string): string {
  return nickname === null ? `${noun}${verb}。` : `「${nickname}」的${noun}${verb}。`;
}

export function AdminUserManagementPanel() {
  const list = useAdminUserList();
  const commands = useAdminUserCommands(list.reload);
  const dialogSession = useDialogSessionSeq<AdminUserDialogKey>();
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

  /**
   * 打开 / 关闭 / 切换目标一律在事件处理器里**同步**推进会话代次。
   *
   * 代次若靠 effect 推进，关闭与立刻重开会落在同一个事件循环窗口内，
   * 旧请求的成功续体就能把新一代弹窗关掉。
   *
   * 边界说明：antd 6.4.3 的 `Modal.handleCancel` 在 `confirmLoading` 为真时直接 `return`，
   * 取消按钮、右上角 X、遮罩点击与 Esc 四条关闭路径共用它，而下面五个弹窗的
   * `submitting` 都接到了 `commands.isPending(key)`。也就是说当前接线下用户在提交期间
   * 关不掉弹窗，本层守卫拦的是「提交期间切换目标」以及宿主接线一旦放松后的
   * 「关闭 / 重开」，而不是一个当前可复现的用户操作序列。
   */
  const openCreateDialog = () => {
    // 只在 closed → open 的真实翻转上推进：弹窗侧守卫以 `open` 为会话身份，
    // 面板若在一次无效的重入上也推进，两层就会对「是否新会话」给出相反答案：
    // 面板当成陈旧而不关闭，弹窗当成新鲜而写入错误区。
    if (!createOpen) {
      dialogSession.advance('create');
    }

    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    dialogSession.advance('create');
    setCreateOpen(false);
  };

  const openRowDialog = (
    key: AdminUserRowDialogKey,
    currentRow: AdminUserRow | null,
    setRow: AdminUserRowSetter,
    row: AdminUserRow,
  ) => {
    // 目标 accountId 未变 = 同一次会话仍在继续：弹窗侧守卫以 accountId 为身份、不会推进，
    // 面板也不能推进，否则一次重入就会让在途提交被误判成陈旧。
    if (currentRow?.accountId !== row.accountId) {
      dialogSession.advance(key);
    }

    setRow(row);
  };

  const closeRowDialog = (key: AdminUserRowDialogKey, setRow: AdminUserRowSetter) => {
    dialogSession.advance(key);
    setRow(null);
  };

  /**
   * 创建弹窗成功收尾：没有 accountId，会话代次就是它的完整身份。
   *
   * @returns 本次成功是否属于当前会话；false ⇒ 陈旧，调用方据此改用点名目标的反馈措辞
   */
  const closeCreateDialogOnSuccess = (sessionSeq: number): boolean => {
    if (!dialogSession.isCurrent('create', sessionSeq)) {
      return false;
    }

    setCreateOpen(false);
    dialogSession.advance('create');

    return true;
  };

  /**
   * 行级弹窗成功收尾：会话代次 + 目标 accountId 双重核对，两步缺一不可。
   *
   * - 代次（ref，同步）识别「提交期间关闭 / 重开 / 切换目标」，其中关闭后重开同一个
   *   accountId 时两边 accountId 完全相同，只核对 accountId 一定会误关新弹窗；
   * - 函数式 updater 对**最新** state 复核 accountId，是关闭动作自身的最后一道闸。
   *
   * toast / reload / 改 ref 全部留在 updater 之外：updater 必须纯，且它要到下一次 render 才执行。
   * reload 由 `useAdminUserCommands` 在命令成功后统一触发，陈旧成功同样照常刷新列表。
   *
   * @returns 本次成功是否属于当前会话；false ⇒ 陈旧，调用方据此改用点名目标的反馈措辞
   */
  const closeRowDialogOnSuccess = (
    key: AdminUserRowDialogKey,
    sessionSeq: number,
    targetAccountId: number,
    setRow: AdminUserRowSetter,
  ): boolean => {
    if (!dialogSession.isCurrent(key, sessionSeq)) {
      return false;
    }

    setRow((current) =>
      current !== null && current.accountId === targetAccountId ? null : current,
    );
    dialogSession.advance(key);

    return true;
  };

  const submitCreate = async (draft: AdminUserCreateDraft): Promise<AdminUserCommandResult> => {
    const sessionSeq = dialogSession.capture('create');
    const execution = await commands.createUser(draft);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        if (closeCreateDialogOnSuccess(sessionSeq)) {
          message.success('用户已创建。');
        } else {
          // 陈旧但写入确实发生：点名实际提交的草稿，避免被误读成重开后那次的结果
          message.success(`「${draft.nickname}」已创建。`);
        }
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
    const sessionSeq = dialogSession.capture('profile');
    const targetAccountId = draft.accountId;
    // 提交时刻的行快照：陈旧成功的反馈需要点名实际提交的目标
    const targetNickname = profileRow?.accountId === targetAccountId ? profileRow.nickname : null;

    const execution = await commands.updateUserProfile(draft);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        if (closeRowDialogOnSuccess('profile', sessionSeq, targetAccountId, setProfileRow)) {
          message.success('资料已更新。');
        } else {
          message.success(toTargetedSuccessMessage(targetNickname, '资料', '已更新'));
        }
      }

      // 业务失败原样回传：是否写进弹窗错误区由弹窗侧代次守卫判定，
      // panel 不代为裁决，避免两层守卫对「陈旧」的定义出现分叉
      return execution.result;
    }

    if (execution.kind === 'unhandled-error') {
      return { ok: false, reason: 'update-failed', message: execution.message };
    }

    // in-flight：同类命令进行中，OK 按钮已 loading，静默忽略不叠加任何提示
    return { ok: false, reason: 'update-failed', message: '' };
  };

  const submitRoleChange = async (input: {
    accountId: number;
    role: AdminUserWritableRole;
  }): Promise<AdminUserCommandResult> => {
    const sessionSeq = dialogSession.capture('role');
    const targetNickname = roleRow?.accountId === input.accountId ? roleRow.nickname : null;

    const execution = await commands.changeUserRole(input);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        if (closeRowDialogOnSuccess('role', sessionSeq, input.accountId, setRoleRow)) {
          message.success('角色已修改。');
        } else {
          message.success(toTargetedSuccessMessage(targetNickname, '角色', '已修改'));
        }
      }

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
    const sessionSeq = dialogSession.capture('status');
    const targetNickname = statusRow?.accountId === input.accountId ? statusRow.nickname : null;

    const execution = await commands.setUserStatus(input);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        if (closeRowDialogOnSuccess('status', sessionSeq, input.accountId, setStatusRow)) {
          message.success('状态已修改。');
        } else {
          message.success(toTargetedSuccessMessage(targetNickname, '状态', '已修改'));
        }
      }

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
    const sessionSeq = dialogSession.capture('reset-password');
    const execution = await commands.resetUserPassword(input);

    if (execution.kind === 'ok') {
      if (execution.result.ok) {
        // 陈旧成功同样不得关掉当前弹窗（可能已是另一个目标或重开后的同一目标）
        closeRowDialogOnSuccess('reset-password', sessionSeq, input.accountId, setResetPasswordRow);
        // 成功提示只展示后端固定安全提示 notice，密码不出现在任何反馈中；
        // notice 本身不含目标身份，因此陈旧成功也逐字沿用，不做追加改写
        message.success(execution.result.notice, 6);

        return { ok: true };
      }

      return execution.result;
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
            onClick: () => openRowDialog('profile', profileRow, setProfileRow, row),
          },
          {
            disabled: !canChangeAdminUserRole(row),
            key: 'role',
            label: '角色',
            onClick: () => openRowDialog('role', roleRow, setRoleRow, row),
          },
          {
            disabled: !canToggleAdminUserStatus(row),
            key: 'status',
            label: '启停',
            onClick: () => openRowDialog('status', statusRow, setStatusRow, row),
          },
          {
            disabled: !canResetAdminUserPassword(row),
            key: 'reset-password',
            label: '重置密码',
            onClick: () =>
              openRowDialog('reset-password', resetPasswordRow, setResetPasswordRow, row),
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

        <Button type="primary" onClick={openCreateDialog}>
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
        onCancel={closeCreateDialog}
        onSubmit={submitCreate}
      />

      <AdminUserProfileEditModal
        row={profileRow}
        submitting={isProfileSubmitting}
        onCancel={() => closeRowDialog('profile', setProfileRow)}
        onSubmit={submitProfileEdit}
      />

      <AdminUserRoleModal
        row={roleRow}
        submitting={isRoleSubmitting}
        onCancel={() => closeRowDialog('role', setRoleRow)}
        onSubmit={submitRoleChange}
      />

      <AdminUserStatusModal
        row={statusRow}
        submitting={isStatusSubmitting}
        onCancel={() => closeRowDialog('status', setStatusRow)}
        onSubmit={submitStatusChange}
      />

      <AdminUserResetPasswordModal
        row={resetPasswordRow}
        submitting={isResetPasswordSubmitting}
        onCancel={() => closeRowDialog('reset-password', setResetPasswordRow)}
        onSubmit={submitPasswordReset}
      />
    </div>
  );
}
