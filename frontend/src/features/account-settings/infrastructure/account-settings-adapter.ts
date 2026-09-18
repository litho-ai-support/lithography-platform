// src/features/account-settings/infrastructure/account-settings-adapter.ts

/**
 * 账号设置的 GraphQL adapter（外部技术边界唯一落点）。
 *
 * - 复用 shared/graphql 的 executeGraphQL（Apollo client、Token 注入、ingress 错误模型），
 *   不创建第二个 Apollo Client，不直接 fetch /graphql；
 * - 原始 DTO 与 operation 只停留在本目录；对外返回 feature 内部模型或显式业务结果；
 * - 业务拒绝按稳定的 extensions.code 大类映射为显式失败结果（不依赖生产可能隐藏的
 *   extensions.errorCode）；transport / auth / 网络类失败仍上抛 GraphQLIngressError，
 *   UNAUTHENTICATED 由共享 ingress 链路交给全局会话失效处理（本 adapter 不做登出，
 *   修改密码成功后的客户端会话收口由页面装配层接线，见 pages/account-settings）。
 *
 * 错误码真源：backend/src/core/common/errors/domain-error.ts 的 MY_ACCOUNT_ERROR 组与
 * graphql-exception.filter.ts 的大类映射。显式条目：LOGIN_CREDENTIAL_BOTH_EMPTY /
 * CURRENT_PASSWORD_MISMATCH → BAD_USER_INPUT、CREDENTIAL_CONFLICT → CONFLICT；
 * READ / WRITE / ROLE_DATA 复用 ADMIN_USER_ERROR 的显式 INTERNAL_SERVER_ERROR 条目。
 * 两点边界：① INPUT_NORMALIZE_* 在 filter 的 errorCodeMap 中没有显式条目，走
 * `|| 'BAD_USER_INPUT'` 默认兜底（结论同显式映射，但 filter 里找不到这些条目）；
 * ② DTO 协议级校验（class-validator → BadRequestException）在生产环境被 filter 收敛为
 * INTERNAL_SERVER_ERROR 且不透传 errorMessage——登录名格式与密码策略说明因此由前端
 * 兜底（见 ui/account-credentials-form.tsx 与 ui/change-password-form.tsx）。
 */

import { executeGraphQL, readGraphQLErrorDetail } from '@/shared/graphql';

import type {
  AccountSettingsProfileDraft,
  AccountSettingsProfileFailureReason,
  AccountSettingsProfileUpdateResult,
  AccountSettingsView,
  ChangeMyPasswordFailureReason,
  ChangeMyPasswordInput,
  ChangeMyPasswordResult,
} from '../application/account-settings.types';

import type {
  ChangeMyPasswordResultDto,
  MyAccountSettingsDto,
  UpdateMyAccountSettingsResultDto,
} from './account-settings.dto';
import { mapMyAccountSettingsDtoToView } from './account-settings-mapper';

const MY_ACCOUNT_SETTINGS_FIELDS = `
      loginName
      loginEmail
      nickname
      companyName
      phone
      contactEmail
      role
      status
      updatedAt
`;

const MY_ACCOUNT_SETTINGS_QUERY = `
  query MyAccountSettings {
    myAccountSettings {
${MY_ACCOUNT_SETTINGS_FIELDS}
    }
  }
`;

const UPDATE_MY_ACCOUNT_SETTINGS_MUTATION = `
  mutation UpdateMyAccountSettings($input: UpdateMyAccountSettingsInput!) {
    updateMyAccountSettings(input: $input) {
      isUpdated
      settings {
${MY_ACCOUNT_SETTINGS_FIELDS}
      }
    }
  }
`;

const CHANGE_MY_PASSWORD_MUTATION = `
  mutation ChangeMyPassword($input: ChangeMyPasswordInput!) {
    changeMyPassword(input: $input) {
      isUpdated
      notice
    }
  }
`;

type MyAccountSettingsQueryData = {
  myAccountSettings: MyAccountSettingsDto;
};

type UpdateMyAccountSettingsData = {
  updateMyAccountSettings: UpdateMyAccountSettingsResultDto;
};

type ChangeMyPasswordData = {
  changeMyPassword: ChangeMyPasswordResultDto;
};

type UpdateMyAccountSettingsInputDto = {
  companyName?: string | null;
  contactEmail?: string | null;
  loginEmail?: string | null;
  loginName?: string | null;
  nickname?: string;
  phone?: string | null;
};

type CommandReasonMap<Reason extends string> = Partial<Record<string, Reason>>;

/** 大类码 → 展示原因映射（extensions.code 契约保证稳定）；errorMessage 仅作可选细化 */
const PROFILE_REASON_BY_CATEGORY_CODE: CommandReasonMap<AccountSettingsProfileFailureReason> = {
  BAD_USER_INPUT: 'invalid-input',
  CONFLICT: 'duplicate-credential',
  FORBIDDEN: 'forbidden',
  INTERNAL_SERVER_ERROR: 'update-failed',
};

const PASSWORD_REASON_BY_CATEGORY_CODE: CommandReasonMap<ChangeMyPasswordFailureReason> = {
  BAD_USER_INPUT: 'invalid-input',
  FORBIDDEN: 'forbidden',
  INTERNAL_SERVER_ERROR: 'update-failed',
};

const FALLBACK_MESSAGE_BY_REASON: Record<string, string> = {
  'duplicate-credential': '登录名或登录邮箱已被占用，请更换后重试。',
  forbidden: '当前身份无权执行该操作。',
  'invalid-input': '输入不符合要求，请检查后重新提交。',
  'update-failed': '操作失败，请稍后重试。',
};

function toCommandFailure<Reason extends string>(
  error: unknown,
  reasonByCategoryCode: CommandReasonMap<Reason>,
): { message: string; ok: false; reason: Reason } | null {
  const detail = readGraphQLErrorDetail(error);
  const reason = detail?.code ? reasonByCategoryCode[detail.code] : undefined;

  if (!detail || !reason) {
    return null;
  }

  return {
    message: detail.errorMessage ?? FALLBACK_MESSAGE_BY_REASON[reason] ?? '操作失败，请稍后重试。',
    ok: false,
    reason,
  };
}

/**
 * 当前账号设置读取（受保护 query）。
 * 失败（transport / auth / 数据守卫）原样上抛，由 application 的加载状态机收敛。
 */
export async function fetchMyAccountSettings(): Promise<AccountSettingsView> {
  const data = await executeGraphQL<MyAccountSettingsQueryData, Record<string, never>>(
    MY_ACCOUNT_SETTINGS_QUERY,
    {},
  );

  return mapMyAccountSettingsDtoToView(data.myAccountSettings);
}

/**
 * 三态 input 构造：draft 中 `undefined` 的键保持省略（不修改），显式 `null` 原样保留（清空），
 * 字符串原样传递（设置）。本函数不做 trim / 业务裁决——草稿由调用方按当前视图 diff 生成。
 */
function toUpdateInput(draft: AccountSettingsProfileDraft): UpdateMyAccountSettingsInputDto {
  const input: UpdateMyAccountSettingsInputDto = {};

  if (draft.loginName !== undefined) {
    input.loginName = draft.loginName;
  }

  if (draft.loginEmail !== undefined) {
    input.loginEmail = draft.loginEmail;
  }

  if (draft.nickname !== undefined) {
    input.nickname = draft.nickname;
  }

  if (draft.companyName !== undefined) {
    input.companyName = draft.companyName;
  }

  if (draft.phone !== undefined) {
    input.phone = draft.phone;
  }

  if (draft.contactEmail !== undefined) {
    input.contactEmail = draft.contactEmail;
  }

  return input;
}

/** 当前用户资料更新（受保护 mutation），返回后端权威的最新设置视图。 */
export async function updateMyAccountSettingsProfile(
  draft: AccountSettingsProfileDraft,
): Promise<AccountSettingsProfileUpdateResult> {
  try {
    const data = await executeGraphQL<
      UpdateMyAccountSettingsData,
      { input: UpdateMyAccountSettingsInputDto }
    >(UPDATE_MY_ACCOUNT_SETTINGS_MUTATION, { input: toUpdateInput(draft) });

    return {
      isUpdated: data.updateMyAccountSettings.isUpdated,
      ok: true,
      settings: mapMyAccountSettingsDtoToView(data.updateMyAccountSettings.settings),
    };
  } catch (error) {
    const failure = toCommandFailure(error, PROFILE_REASON_BY_CATEGORY_CODE);

    if (failure) {
      return failure;
    }

    throw error;
  }
}

/**
 * 当前用户自助修改密码（受保护 mutation）。
 * 密码本身不出现在任何结果中，成功只回传后端固定安全提示；
 * 客户端会话收口（清理唯一会话真源并跳转登录）由页面装配层执行。
 */
export async function changeMyPassword(
  input: ChangeMyPasswordInput,
): Promise<ChangeMyPasswordResult> {
  try {
    const data = await executeGraphQL<ChangeMyPasswordData, { input: ChangeMyPasswordInput }>(
      CHANGE_MY_PASSWORD_MUTATION,
      { input },
    );

    return { notice: data.changeMyPassword.notice, ok: true };
  } catch (error) {
    const failure = toCommandFailure(error, PASSWORD_REASON_BY_CATEGORY_CODE);

    if (failure) {
      return failure;
    }

    throw error;
  }
}
