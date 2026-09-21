// src/features/account-settings/ui/account-credentials-form.tsx

/**
 * 账号信息区块：登录名与登录邮箱（登录凭据）的编辑表单。
 *
 * 登录邮箱必须与基础资料区块的「联系邮箱」严格区分：后者仅作联系方式，不用于登录。
 * 空输入按后端三态语义提交为 null（清空该凭据），两个凭据至少要保留一个；
 * 保存成功后，仅当请求期间用户没有继续输入时才把后端返回的权威值回写表单：
 * 以「编辑版本」作守卫——onValuesChange 随用户每次输入递增，提交时快照、
 * 成功响应回来时比对；请求期间的任何后续输入都不会被陈旧响应覆盖。
 * 提交前已发生的修改不受影响：提交的即用户所见值，回写仅归一空白差异。
 *
 * 登录名格式（长度与字符集）与登录邮箱格式在前端做镜像校验，且一律**先 trim 再校验**，
 * 与后端「先 `@Transform(trimTextPure)` 再校验」同序（trim 只作用于校验值，不改写用户
 * 输入过程中的显示值）。生产环境下后端 DTO 校验细节会被 graphql-exception.filter 收敛为
 * INTERNAL_SERVER_ERROR（不透传 errorMessage），不做客户端校验时用户只能看到
 * 「操作失败，请稍后重试」；策略真源仍是后端。
 */

import { useRef, useState } from 'react';
import { Alert, Form, Input, message } from 'antd';

import { PrimaryButton } from '@/shared/ui/buttons';

import type {
  AccountSettingsProfileDraft,
  AccountSettingsProfileUpdateResult,
  AccountSettingsView,
} from '../application/account-settings.types';
import {
  ACCOUNT_LOGIN_NAME_MAX_LENGTH,
  ACCOUNT_LOGIN_NAME_MIN_LENGTH,
  ACCOUNT_LOGIN_NAME_PATTERN,
  ACCOUNT_LOGIN_NAME_RULE_MESSAGE,
} from '../application/account-settings-policy';
import type { AccountSettingsCommandExecution } from '../application/use-account-settings';

type AccountCredentialsFormProps = {
  onSubmit: (
    draft: AccountSettingsProfileDraft,
  ) => Promise<AccountSettingsCommandExecution<AccountSettingsProfileUpdateResult>>;
  settings: AccountSettingsView;
  submitting: boolean;
};

type AccountCredentialsFormValues = {
  loginEmail: string;
  loginName: string;
};

/** 表单空输入 → 三态草稿的 null（清空）；非空 trim 后设置 */
function toCredentialDraftValue(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
}

export function AccountCredentialsForm({
  onSubmit,
  settings,
  submitting,
}: AccountCredentialsFormProps) {
  const [form] = Form.useForm<AccountCredentialsFormValues>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const editVersionRef = useRef(0);

  const handleFinish = async (values: AccountCredentialsFormValues) => {
    setSubmitError(null);
    const editVersionAtSubmit = editVersionRef.current;

    const execution = await onSubmit({
      loginEmail: toCredentialDraftValue(values.loginEmail),
      loginName: toCredentialDraftValue(values.loginName),
    });

    if (execution.kind !== 'ok') {
      // in-flight：提交按钮已处于 loading 态，静默忽略；
      // unhandled-error：transport / 网络类失败，展示收敛后的兜底文案
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

    message.success(result.isUpdated ? '登录凭据已保存。' : '登录凭据未发生变化。');

    // setFieldsValue 不触发 onValuesChange，回写不会推进编辑版本
    if (editVersionRef.current === editVersionAtSubmit) {
      form.setFieldsValue({
        loginEmail: result.settings.loginEmail ?? '',
        loginName: result.settings.loginName ?? '',
      });
    }
  };

  return (
    <Form
      form={form}
      initialValues={{
        loginEmail: settings.loginEmail ?? '',
        loginName: settings.loginName ?? '',
      }}
      layout="vertical"
      onFinish={(values) => void handleFinish(values)}
      onValuesChange={() => {
        editVersionRef.current += 1;
      }}
    >
      <Form.Item<AccountCredentialsFormValues>
        dependencies={['loginEmail']}
        label="登录名"
        name="loginName"
        rules={[
          {
            // 空值放行：由「至少保留一个」校验裁决；格式只校验非空值，
            // 与后端「先 Transform trim 再校验」同序
            validator: (_, value) => {
              const trimmed = typeof value === 'string' ? value.trim() : '';

              if (trimmed === '') {
                return Promise.resolve();
              }

              return trimmed.length >= ACCOUNT_LOGIN_NAME_MIN_LENGTH &&
                trimmed.length <= ACCOUNT_LOGIN_NAME_MAX_LENGTH &&
                ACCOUNT_LOGIN_NAME_PATTERN.test(trimmed)
                ? Promise.resolve()
                : Promise.reject(new Error(ACCOUNT_LOGIN_NAME_RULE_MESSAGE));
            },
          },
          {
            validator: (_, value) => {
              const hasLoginName = typeof value === 'string' && value.trim() !== '';
              const loginEmail = form.getFieldValue('loginEmail') as string | undefined;
              const hasLoginEmail = typeof loginEmail === 'string' && loginEmail.trim() !== '';

              return hasLoginName || hasLoginEmail
                ? Promise.resolve()
                : Promise.reject(new Error('登录名与登录邮箱至少需要保留一个'));
            },
          },
        ]}
      >
        <Input autoComplete="off" placeholder="登录凭据之一" />
      </Form.Item>

      <Form.Item<AccountCredentialsFormValues>
        dependencies={['loginName']}
        label="登录邮箱（登录凭据）"
        name="loginEmail"
        rules={[
          {
            message: '登录邮箱格式不正确',
            // 只转换**校验值**（与后端「先 @Transform(trimTextPure) 再 @IsEmail」同序）。
            // 刻意不用 Input 的 normalize：那会在用户输入过程中改写显示值，吞掉刚敲下的空格。
            // 纯空白 trim 后成为空串，由 async-validator 的空值短路放行，落到既有清空语义。
            transform: (value: unknown) => (typeof value === 'string' ? value.trim() : value),
            type: 'email',
          },
          {
            validator: (_, value) => {
              const hasLoginEmail = typeof value === 'string' && value.trim() !== '';
              const loginName = form.getFieldValue('loginName') as string | undefined;
              const hasLoginName = typeof loginName === 'string' && loginName.trim() !== '';

              return hasLoginEmail || hasLoginName
                ? Promise.resolve()
                : Promise.reject(new Error('登录名与登录邮箱至少需要保留一个'));
            },
          },
        ]}
      >
        <Input autoComplete="off" placeholder="登录凭据之一" />
      </Form.Item>

      {submitError ? <Alert showIcon title={submitError} type="error" /> : null}

      <div className="mt-4">
        <PrimaryButton htmlType="submit" loading={submitting}>
          保存
        </PrimaryButton>
      </div>
    </Form>
  );
}
