// src/features/admin-user-management/ui/admin-user-row-command-modals.tsx

/**
 * 行级写命令弹窗：资料编辑、角色修改、启停、密码重置。
 * 四个弹窗共用同一提交契约：onSubmit 返回显式业务结果，ok 时由父组件关闭弹窗并刷新列表；
 * 业务失败展示在弹窗内（不关闭、不清空已填草稿）；密码字段不回填、不进入任何成功提示。
 *
 * 四个弹窗都恒定挂载在 panel 中、只切换 `row`，因此每一个都接入 `useStaleSubmitGuard`：
 * 会话在提交续体回来之前被推进过（切换目标行、关闭后重新打开，含同一个 accountId），
 * 在途提交的续体就属于上一代会话，不得写进当前弹窗的错误区。
 * 注：antd 6.4.3 的 `Modal.handleCancel` 在 `confirmLoading` 为真时会直接 `return`，
 * 而 `submitting` 由宿主传入；守卫不依赖宿主的 loading 接线，详见 `use-stale-submit-guard.ts`。
 */

import { Alert, Form, Input, Modal, Radio } from 'antd';

import type {
  AdminUserCommandResult,
  AdminUserProfileEditDraft,
  AdminUserRow,
  AdminUserStatusFilter,
  AdminUserWritableRole,
} from '../application/admin-user-management.types';
import {
  ADMIN_USER_NICKNAME_MAX_LENGTH,
  ADMIN_USER_ROLE_LABELS,
  ADMIN_USER_STATUS_FILTER_OPTIONS,
  ADMIN_USER_STATUS_LABELS,
  ADMIN_USER_WRITABLE_ROLES,
  isAdminUserStatusWritable,
  isAdminUserWritableRole,
} from '../application/admin-user-management-policy';

import { useStaleSubmitGuard } from './use-stale-submit-guard';

// 弹窗内表单以行 accountId 为 key：快速切换行时强制重挂载，
// 避免 initialValues 在 Form 未卸载时不生效导致字段残留上一行草稿
function toRowFormKey(row: AdminUserRow | null): string {
  return row === null ? 'none' : `row-${row.accountId}`;
}

type SubmittingModalProps = {
  submitting: boolean;
};

// ---- 资料编辑 ----

type AdminUserProfileEditModalProps = SubmittingModalProps & {
  row: AdminUserRow | null;
  onCancel: () => void;
  onSubmit: (draft: AdminUserProfileEditDraft) => Promise<AdminUserCommandResult>;
};

type ProfileEditFormValues = {
  companyName: string;
  contactEmail: string;
  nickname: string;
  phone: string;
};

export function AdminUserProfileEditModal({
  onCancel,
  onSubmit,
  row,
  submitting,
}: AdminUserProfileEditModalProps) {
  const [form] = Form.useForm<ProfileEditFormValues>();
  // 目标 accountId 就是本弹窗的会话身份：切换行、关闭后重开都会推进代次
  const {
    captureSubmitSeq,
    invalidateInFlightSubmit,
    isCurrentSubmitSeq,
    setSubmitError,
    submitError,
  } = useStaleSubmitGuard(row === null ? null : row.accountId);

  const handleFinish = async (values: ProfileEditFormValues) => {
    if (!row) {
      return;
    }

    const submitSeq = captureSubmitSeq();

    setSubmitError(null);

    // 差异提交：以打开弹窗时的行值为 baseline，仅提交发生变化的字段。
    // 清空输入框 = 显式清空（null）；未变化的字段不进 draft（= 不修改），
    // 避免把过期旧值重发而覆盖其他管理员的并发修改（后端三态契约）。
    const draft: AdminUserProfileEditDraft = { accountId: row.accountId };
    const nickname = values.nickname.trim();

    if (nickname !== row.nickname) {
      draft.nickname = nickname;
    }

    if (values.companyName.trim() !== (row.companyName ?? '')) {
      draft.companyName = values.companyName.trim() || null;
    }

    if (values.contactEmail.trim() !== (row.contactEmail ?? '')) {
      draft.contactEmail = values.contactEmail.trim() || null;
    }

    if (values.phone.trim() !== (row.phone ?? '')) {
      draft.phone = values.phone.trim() || null;
    }

    if (
      draft.nickname === undefined &&
      draft.companyName === undefined &&
      draft.contactEmail === undefined &&
      draft.phone === undefined
    ) {
      setSubmitError('请至少修改一项资料后再保存。');
      return;
    }

    const result = await onSubmit(draft);

    // 提交期间弹窗被关闭 / 重开 / 切换目标 ⇒ 本次结果属于上一会话，整体丢弃：
    // 既不把旧失败写进新目标的弹窗，也不清除新会话已有的错误
    if (!isCurrentSubmitSeq(submitSeq)) {
      return;
    }

    if (!result.ok && result.message) {
      setSubmitError(result.message);
    }
  };

  return (
    <Modal
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      okText="保存"
      open={row !== null}
      title={`编辑资料：${row?.nickname ?? ''}`}
      onCancel={() => {
        // 同步推进代次：关闭与「立刻重开同一个 accountId」可能落在同一个事件循环窗口内
        invalidateInFlightSubmit();
        onCancel();
      }}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        initialValues={
          row
            ? {
                companyName: row.companyName ?? '',
                contactEmail: row.contactEmail ?? '',
                nickname: row.nickname,
                phone: row.phone ?? '',
              }
            : undefined
        }
        key={toRowFormKey(row)}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item<ProfileEditFormValues>
          label="昵称"
          name="nickname"
          rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}
        >
          <Input maxLength={ADMIN_USER_NICKNAME_MAX_LENGTH} />
        </Form.Item>

        <Form.Item<ProfileEditFormValues>
          extra="留空并保存表示清空该字段。"
          label="公司名称"
          name="companyName"
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item<ProfileEditFormValues>
          extra="留空并保存表示清空该字段。"
          label="电话"
          name="phone"
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item<ProfileEditFormValues>
          extra="联系邮箱不用于登录，仅作联系方式；留空并保存表示清空该字段。"
          label="联系邮箱（非登录凭据）"
          name="contactEmail"
          rules={[{ type: 'email', message: '联系邮箱格式不正确' }]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        {submitError ? <Alert message={submitError} showIcon type="error" /> : null}
      </Form>
    </Modal>
  );
}

// ---- 角色修改 ----

type AdminUserRoleModalProps = SubmittingModalProps & {
  onCancel: () => void;
  onSubmit: (input: {
    accountId: number;
    role: AdminUserWritableRole;
  }) => Promise<AdminUserCommandResult>;
  row: AdminUserRow | null;
};

type RoleFormValues = {
  role: AdminUserWritableRole;
};

export function AdminUserRoleModal({
  onCancel,
  onSubmit,
  row,
  submitting,
}: AdminUserRoleModalProps) {
  const [form] = Form.useForm<RoleFormValues>();
  const {
    captureSubmitSeq,
    invalidateInFlightSubmit,
    isCurrentSubmitSeq,
    setSubmitError,
    submitError,
  } = useStaleSubmitGuard(row === null ? null : row.accountId);

  const handleFinish = async (values: RoleFormValues) => {
    if (!row) {
      return;
    }

    const submitSeq = captureSubmitSeq();

    setSubmitError(null);

    const result = await onSubmit({ accountId: row.accountId, role: values.role });

    if (!isCurrentSubmitSeq(submitSeq)) {
      return;
    }

    if (!result.ok && result.message) {
      setSubmitError(result.message);
    }
  };

  return (
    <Modal
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      okText="确认修改"
      open={row !== null}
      title={`修改角色：${row?.nickname ?? ''}`}
      onCancel={() => {
        // 同步推进代次：关闭与「立刻重开同一个 accountId」可能落在同一个事件循环窗口内
        invalidateInFlightSubmit();
        onCancel();
      }}
      onOk={() => void form.submit()}
    >
      {row ? (
        <p>
          当前角色：{ADMIN_USER_ROLE_LABELS[row.role]}
          。修改后，目标用户的下一次受保护请求将按新角色生效。
        </p>
      ) : null}

      <Form
        form={form}
        initialValues={{
          role: row && isAdminUserWritableRole(row.role) ? row.role : undefined,
        }}
        key={toRowFormKey(row)}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item<RoleFormValues>
          label="目标角色"
          name="role"
          rules={[{ required: true, message: '请选择目标角色' }]}
        >
          <Radio.Group
            options={ADMIN_USER_WRITABLE_ROLES.map((role) => ({
              value: role,
              label: ADMIN_USER_ROLE_LABELS[role],
            }))}
          />
        </Form.Item>

        {submitError ? <Alert message={submitError} showIcon type="error" /> : null}
      </Form>
    </Modal>
  );
}

// ---- 启停 ----

type AdminUserStatusModalProps = SubmittingModalProps & {
  onCancel: () => void;
  onSubmit: (input: {
    accountId: number;
    status: AdminUserStatusFilter;
  }) => Promise<AdminUserCommandResult>;
  row: AdminUserRow | null;
};

type StatusFormValues = {
  status: AdminUserStatusFilter;
};

export function AdminUserStatusModal({
  onCancel,
  onSubmit,
  row,
  submitting,
}: AdminUserStatusModalProps) {
  const [form] = Form.useForm<StatusFormValues>();
  const {
    captureSubmitSeq,
    invalidateInFlightSubmit,
    isCurrentSubmitSeq,
    setSubmitError,
    submitError,
  } = useStaleSubmitGuard(row === null ? null : row.accountId);

  const handleFinish = async (values: StatusFormValues) => {
    if (!row) {
      return;
    }

    const submitSeq = captureSubmitSeq();

    setSubmitError(null);

    const result = await onSubmit({ accountId: row.accountId, status: values.status });

    if (!isCurrentSubmitSeq(submitSeq)) {
      return;
    }

    if (!result.ok && result.message) {
      setSubmitError(result.message);
    }
  };

  return (
    <Modal
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      okText="确认"
      open={row !== null}
      title={`启用 / 停用：${row?.nickname ?? ''}`}
      onCancel={() => {
        // 同步推进代次：关闭与「立刻重开同一个 accountId」可能落在同一个事件循环窗口内
        invalidateInFlightSubmit();
        onCancel();
      }}
      onOk={() => void form.submit()}
    >
      {row ? (
        <p>
          当前状态：
          {isAdminUserStatusWritable(row.status)
            ? ADMIN_USER_STATUS_LABELS[row.status]
            : row.status}
          。停用后，目标用户的下一次受保护请求将立即失效。
        </p>
      ) : null}

      <Form
        form={form}
        initialValues={{
          status: row && isAdminUserStatusWritable(row.status) ? row.status : undefined,
        }}
        key={toRowFormKey(row)}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item<StatusFormValues>
          label="目标状态"
          name="status"
          rules={[{ required: true, message: '请选择目标状态' }]}
        >
          <Radio.Group
            options={ADMIN_USER_STATUS_FILTER_OPTIONS.map((status) => ({
              value: status,
              label: ADMIN_USER_STATUS_LABELS[status],
            }))}
          />
        </Form.Item>

        {submitError ? <Alert message={submitError} showIcon type="error" /> : null}
      </Form>
    </Modal>
  );
}

// ---- 密码重置 ----

type AdminUserResetPasswordModalProps = SubmittingModalProps & {
  onCancel: () => void;
  onSubmit: (input: { accountId: number; newPassword: string }) => Promise<AdminUserCommandResult>;
  row: AdminUserRow | null;
};

type ResetPasswordFormValues = {
  confirmNewPassword: string;
  newPassword: string;
};

export function AdminUserResetPasswordModal({
  onCancel,
  onSubmit,
  row,
  submitting,
}: AdminUserResetPasswordModalProps) {
  const [form] = Form.useForm<ResetPasswordFormValues>();
  const {
    captureSubmitSeq,
    invalidateInFlightSubmit,
    isCurrentSubmitSeq,
    setSubmitError,
    submitError,
  } = useStaleSubmitGuard(row === null ? null : row.accountId);

  const handleFinish = async (values: ResetPasswordFormValues) => {
    if (!row) {
      return;
    }

    const submitSeq = captureSubmitSeq();

    setSubmitError(null);

    const result = await onSubmit({ accountId: row.accountId, newPassword: values.newPassword });

    if (!isCurrentSubmitSeq(submitSeq)) {
      return;
    }

    if (!result.ok && result.message) {
      setSubmitError(result.message);
    }
  };

  return (
    <Modal
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      okText="重置密码"
      open={row !== null}
      title={`重置密码：${row?.nickname ?? ''}`}
      onCancel={() => {
        // 同步推进代次：关闭与「立刻重开同一个 accountId」可能落在同一个事件循环窗口内
        invalidateInFlightSubmit();
        onCancel();
      }}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={toRowFormKey(row)}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item<ResetPasswordFormValues>
          extra="新密码仅在提交时使用一次，不可回填或再次查看；请通过线下渠道告知用户。"
          label="新密码"
          name="newPassword"
          rules={[{ required: true, message: '请输入新密码' }]}
        >
          <Input.Password autoComplete="new-password" placeholder="需满足后端密码策略" />
        </Form.Item>

        <Form.Item<ResetPasswordFormValues>
          dependencies={['newPassword']}
          label="确认新密码"
          name="confirmNewPassword"
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="再次输入新密码" />
        </Form.Item>

        {submitError ? <Alert message={submitError} showIcon type="error" /> : null}
      </Form>
    </Modal>
  );
}
