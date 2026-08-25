// src/usecases/registration/registration-input.normalize.ts

import { AudienceTypeEnum } from '@app-types/models/account.types';
import { DomainError } from '@core/common/errors';
import { INPUT_NORMALIZE_ERROR } from '@core/common/errors/domain-error';
import {
  normalizeEnumValue,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@core/common/input-normalize/input-normalize.policy';

interface RegisterWithEmailNormalizeInput {
  loginEmail: string;
  nickname?: string | null;
}

interface RegisterWithEmailNormalizeOutput {
  loginEmail: string;
  nickname?: string;
}

interface RegisterWithThirdPartyNormalizeInput {
  email?: string | null;
}

interface RegisterWithThirdPartyNormalizeOutput {
  email?: string;
}

interface WeappRegisterNormalizeOutput {
  defaultNickname: string;
}

interface WeappRegisterParamsNormalizeInput {
  authCredential: string;
  audience: AudienceTypeEnum;
}

interface WeappRegisterParamsNormalizeOutput {
  authCredential: string;
  audience: AudienceTypeEnum;
}

export function normalizeRegisterWithEmailInput(
  input: RegisterWithEmailNormalizeInput,
): RegisterWithEmailNormalizeOutput {
  const normalizedLoginEmail = normalizeRequiredText(input.loginEmail, {
    fieldName: '登录邮箱',
  });
  return {
    loginEmail: normalizeRegistrationEmail(normalizedLoginEmail),
    nickname: normalizeRegistrationNickname(input.nickname),
  };
}

export function normalizeRegistrationNicknameCandidatesInput(input: {
  providedNickname?: unknown;
  fallbackOptions?: unknown;
}): {
  providedNickname?: string;
  fallbackOptions: string[];
} {
  const providedNickname = normalizeOptionalText(input.providedNickname, 'to_undefined', {
    fieldName: '昵称',
  });
  if (typeof input.fallbackOptions === 'undefined' || input.fallbackOptions === null) {
    return {
      providedNickname: providedNickname ?? undefined,
      fallbackOptions: [],
    };
  }
  if (!Array.isArray(input.fallbackOptions)) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT_LIST, '昵称备选项 必须是字符串列表');
  }

  const fallbackOptions: string[] = [];
  for (const option of input.fallbackOptions) {
    const normalized = normalizeOptionalText(option, 'to_undefined', {
      fieldName: '昵称备选项',
    });
    if (typeof normalized === 'string' && !fallbackOptions.includes(normalized)) {
      fallbackOptions.push(normalized);
    }
  }

  return {
    providedNickname: providedNickname ?? undefined,
    fallbackOptions,
  };
}

export function normalizeRegisterWithThirdPartyInput(
  input: RegisterWithThirdPartyNormalizeInput,
): RegisterWithThirdPartyNormalizeOutput {
  const normalizedEmail = normalizeOptionalText(input.email, 'to_undefined', {
    fieldName: '邮箱',
  });

  if (normalizedEmail === null) {
    return { email: undefined };
  }

  if (typeof normalizedEmail === 'undefined') {
    return { email: undefined };
  }

  return {
    email: normalizeRegistrationEmail(normalizedEmail),
  };
}

export function normalizeWeappRegisterInput(): WeappRegisterNormalizeOutput {
  return {
    defaultNickname: normalizeRegistrationNickname('微信用户') ?? '微信用户',
  };
}

export function normalizeWeappRegisterParams(
  input: WeappRegisterParamsNormalizeInput,
): WeappRegisterParamsNormalizeOutput {
  const normalizedCredential = normalizeRequiredText(input.authCredential, {
    fieldName: '身份凭证',
  });
  const normalizedAudience = normalizeEnumValue<AudienceTypeEnum>(
    input.audience,
    Object.values(AudienceTypeEnum),
    { fieldName: '客户端类型' },
  );

  return {
    authCredential: normalizedCredential,
    audience: normalizedAudience,
  };
}

function normalizeRegistrationNickname(value?: string | null): string | undefined {
  const normalizedNickname = normalizeOptionalText(value, 'to_undefined', {
    fieldName: '昵称',
  });

  if (normalizedNickname === null) {
    return undefined;
  }

  if (typeof normalizedNickname === 'undefined') {
    return undefined;
  }

  const transformedNickname = normalizeRegistrationNicknameText(normalizedNickname);
  const stableNickname = normalizeRequiredText(transformedNickname, {
    fieldName: '昵称',
  });
  return validateRegistrationNickname(stableNickname);
}

function normalizeRegistrationEmail(value: string): string {
  return value.toLowerCase();
}

function normalizeRegistrationNicknameText(value: string): string {
  const normalized = value
    .replace(/[\uFF01-\uFF5E]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    })
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      '',
    )
    .trim();

  if (normalized.length === 0) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.OPTIONAL_TEXT_EMPTY_REJECTED, '昵称 不能为空白');
  }

  return normalized;
}

function validateRegistrationNickname(value: string): string {
  if (value.length < 2) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT, '昵称至少 2 个字符');
  }

  if (value.length > 20) {
    throw new DomainError(INPUT_NORMALIZE_ERROR.INVALID_TEXT, '昵称最多 20 个字符');
  }

  if (!/^(?![\p{Script=Han}]{8,})[\p{Script=Han}A-Za-z0-9 _\-\u00B7\u30FB.]{2,20}$/u.test(value)) {
    throw new DomainError(
      INPUT_NORMALIZE_ERROR.INVALID_TEXT,
      '昵称长度限制：中文最多 7 个汉字，整体长度 2 到 20 个字符；允许中文、英文、数字、空格、下划线 _、短横线 -、中点 ·/・、点 .；不支持 Emoji',
    );
  }

  return value;
}
