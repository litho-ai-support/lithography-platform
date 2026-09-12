// src/features/admin-user-management/ui/admin-user-create-modal.tsx

import { Alert, Form, Input, Modal, Select } from 'antd';

import type {
  AdminUserCommandResult,
  AdminUserCreateDraft,
  AdminUserWritableRole,
} from '../application/admin-user-management.types';
import {
  ADMIN_USER_LOGIN_NAME_MAX_LENGTH,
  ADMIN_USER_LOGIN_NAME_MIN_LENGTH,
  ADMIN_USER_NICKNAME_MAX_LENGTH,
  ADMIN_USER_ROLE_LABELS,
  ADMIN_USER_WRITABLE_ROLES,
  findAdminUserCreateCredentialIssue,
} from '../application/admin-user-management-policy';

import { useStaleSubmitGuard } from './use-stale-submit-guard';

type AdminUserCreateModalProps = {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  /** 提交回调返回显式业务结果；ok 时由父组件负责关闭弹窗并刷新列表 */
  onSubmit: (draft: AdminUserCreateDraft) => Promise<AdminUserCommandResult>;
};

type AdminUserCreateFormValues = {
  companyName?: string;
  confirmInitialPassword: string;
  contactEmail?: string;
  initialPassword: string;
  loginEmail?: string;
  loginName?: string;
  nickname: string;
  phone?: string;
  role: AdminUserWritableRole;
};

const LOGIN_NAME_RULE_MESSAGE = `登录名需为 ${ADMIN_USER_LOGIN_NAME_MIN_LENGTH}~${ADMIN_USER_LOGIN_NAME_MAX_LENGTH} 个字符，只允许英文字母、数字、下划线和短横线`;

export function AdminUserCreateModal({
  onCancel,
  onSubmit,
  open,
  submitting,
}: AdminUserCreateModalProps) {
  const [form] = Form.useForm<AdminUserCreateFormValues>();
  // 创建弹窗没有目标 accountId，`open` 的每一次翻转就是一次新会话
  const {
    captureSubmitSeq,
    invalidateInFlightSubmit,
    isCurrentSubmitSeq,
    setSubmitError,
    submitError,
  } = useStaleSubmitGuard(open);

  const handleFinish = async (values: AdminUserCreateFormValues) => {
    const submitSeq = captureSubmitSeq();

    setSubmitError(null);

    const result = await onSubmit({
      companyName: values.companyName ?? '',
      contactEmail: values.contactEmail ?? '',
      initialPassword: values.initialPassword,
      loginEmail: values.loginEmail ?? '',
      loginName: values.loginName ?? '',
      nickname: values.nickname,
      phone: values.phone ?? '',
      role: values.role,
    });

    // 提交期间弹窗被关闭或重开 ⇒ 本次结果属于上一会话，整体丢弃：
    // 既不把旧失败写进重开后的表单，也不清除新会话已有的错误
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
      okText="创建"
      open={open}
      title="创建用户"
      onCancel={() => {
        // 同步推进代次，不等 effect：关闭与「立刻重开」可能落在同一事件循环窗口内
        invalidateInFlightSubmit();
        onCancel();
      }}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item<AdminUserCreateFormValues>
          label="角色"
          name="role"
          rules={[{ required: true, message: '请选择角色' }]}
        >
          <Select
            options={ADMIN_USER_WRITABLE_ROLES.map((role) => ({
              value: role,
              label: ADMIN_USER_ROLE_LABELS[role],
            }))}
            placeholder="请选择角色（仅支持普通用户角色）"
          />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          label="昵称"
          name="nickname"
          rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}
        >
          <Input maxLength={ADMIN_USER_NICKNAME_MAX_LENGTH} placeholder="昵称允许重复" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          dependencies={['loginEmail']}
          label="登录名（登录凭据之一）"
          name="loginName"
          rules={[
            {
              validator: (_, value) => {
                const issue = findAdminUserCreateCredentialIssue(
                  typeof value === 'string' ? value : '',
                  form.getFieldValue('loginEmail') ?? '',
                );

                if (issue === 'login-identifier-missing') {
                  return Promise.reject(new Error('登录名与登录邮箱至少提供一个'));
                }

                if (issue === 'login-name-invalid') {
                  return Promise.reject(new Error(LOGIN_NAME_RULE_MESSAGE));
                }

                return Promise.resolve();
              },
            },
          ]}
        >
          <Input autoComplete="off" placeholder="与登录邮箱至少提供一个" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          label="登录邮箱（登录凭据之一）"
          name="loginEmail"
          rules={[{ type: 'email', message: '登录邮箱格式不正确' }]}
        >
          <Input autoComplete="off" placeholder="与登录名至少提供一个" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          extra="密码长度需为 8～128 位，至少包含小写字母、数字和特殊字符，不能使用常见弱密码。密码仅在创建时提交一次，提交后不可再查看。"
          label="初始密码"
          name="initialPassword"
          rules={[{ required: true, message: '请输入初始密码' }]}
        >
          <Input.Password autoComplete="new-password" placeholder="需满足后端密码策略" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          dependencies={['initialPassword']}
          label="确认初始密码"
          name="confirmInitialPassword"
          rules={[
            { required: true, message: '请再次输入初始密码' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                value === getFieldValue('initialPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="再次输入初始密码" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues> label="公司名称" name="companyName">
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues> label="电话" name="phone">
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item<AdminUserCreateFormValues>
          extra="联系邮箱不用于登录，仅作联系方式。"
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
