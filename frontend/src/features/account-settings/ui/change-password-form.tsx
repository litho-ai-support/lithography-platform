// src/features/account-settings/ui/change-password-form.tsx

/**
 * 安全设置区块：修改登录密码表单。
 *
 * 前端只做「两次输入一致」的一致性判断，密码强度与格式策略完全以后端校验为准，
 * 后端返回的业务文案原样展示。
 *
 * Token 语义（与后端 `ChangeMyPasswordUsecase` 同口径）：服务端**不**立即撤销已签发的
 * Access Token，旧 Token 按 `JWT_EXPIRES_IN` 自然过期；本链路不做 Token 黑名单、
 * tokenVersion、Refresh Token 或服务端 Session 撤销。修改成功后由**前端**清理本地会话
 * 并跳转登录页——本表单只调用 `onSucceeded`，实际的会话清理与跳转由页面装配层
 * （`pages/account-settings`）完成，本表单不发起任何后续请求。
 */

import { useState } from 'react';
import { Alert, Form, Input, message } from 'antd';

import { PrimaryButton, SecondaryButton } from '@/shared/ui/buttons';

import type {
  ChangeMyPasswordInput,
  ChangeMyPasswordResult,
} from '../application/account-settings.types';
import type { AccountSettingsCommandExecution } from '../application/use-account-settings';

type ChangePasswordFormProps = {
  /** 修改密码成功后的会话收口（登出 + 跳转登录页），由页面装配层提供 */
  onSucceeded?: () => void | Promise<void>;
  onSubmit: (
    input: ChangeMyPasswordInput,
  ) => Promise<AccountSettingsCommandExecution<ChangeMyPasswordResult>>;
  submitting: boolean;
};

type ChangePasswordFormValues = {
  confirmNewPassword: string;
  currentPassword: string;
  newPassword: string;
};

export function ChangePasswordForm({ onSucceeded, onSubmit, submitting }: ChangePasswordFormProps) {
  const [form] = Form.useForm<ChangePasswordFormValues>();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFinish = async (values: ChangePasswordFormValues) => {
    setSubmitError(null);

    const execution = await onSubmit({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });

    if (execution.kind !== 'ok') {
      if (execution.kind === 'unhandled-error') {
        setSubmitError(execution.message);
      }

      return;
    }

    const result = execution.result;

    if (!result.ok) {
      setSubmitError(result.message);

      return;
    }

    message.success(result.notice);
    await onSucceeded?.();
  };

  return (
    <Form form={form} layout="vertical" onFinish={(values) => void handleFinish(values)}>
      <Form.Item<ChangePasswordFormValues>
        label="当前密码"
        name="currentPassword"
        rules={[{ required: true, message: '请输入当前密码' }]}
      >
        <Input.Password autoComplete="current-password" />
      </Form.Item>

      <Form.Item<ChangePasswordFormValues>
        extra="密码长度需为 8～128 位，至少包含小写字母、数字和特殊字符，不能使用常见弱密码；密码强度与格式以后端校验为准。"
        label="新密码"
        name="newPassword"
        rules={[{ required: true, message: '请输入新密码' }]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>

      <Form.Item<ChangePasswordFormValues>
        dependencies={['newPassword']}
        label="确认新密码"
        name="confirmNewPassword"
        rules={[
          { required: true, message: '请再次输入新密码' },
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error('两次输入的新密码不一致')),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>

      {submitError ? <Alert showIcon title={submitError} type="error" /> : null}

      <div className="mt-4 flex gap-2">
        <PrimaryButton htmlType="submit" loading={submitting}>
          修改密码
        </PrimaryButton>
        <SecondaryButton
          disabled={submitting}
          onClick={() => {
            form.resetFields();
            setSubmitError(null);
          }}
        >
          重置
        </SecondaryButton>
      </div>
    </Form>
  );
}
