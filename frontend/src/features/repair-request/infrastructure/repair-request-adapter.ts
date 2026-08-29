// src/features/repair-request/infrastructure/repair-request-adapter.ts

import { executeGraphQL, isGraphQLIngressError } from '@/shared/graphql';

import type {
  CreateRepairRequestFailureReason,
  CreateRepairRequestInput,
  CreateRepairRequestResult,
  EquipmentModelOption,
  RepairRequestRecord,
} from './repair-request.types';

const EQUIPMENT_MODELS_QUERY = `
  query EquipmentModels {
    equipmentModels {
      id
      modelCode
      modelName
    }
  }
`;

const CREATE_REPAIR_REQUEST_MUTATION = `
  mutation CreateRepairRequest($input: CreateRepairRequestInput!) {
    createRepairRequest(input: $input) {
      id
      requestNo
      equipmentModelId
      errorCode
      faultDescription
      createdAt
      isAccepted
    }
  }
`;

/**
 * 拒绝原因主映射：仅依赖契约保证稳定的 GraphQL 大类码 extensions.code
 * （backend/docs/api/graphql-error-contract-current.md），
 * 即使后端按契约在生产隐藏 errorCode 也不会退化失效。
 * transport / auth 类错误不归入业务拒绝，仍抛 GraphQLIngressError（见 graphql-error-model.md）。
 */
const FAILURE_REASON_BY_CATEGORY_CODE: Record<string, CreateRepairRequestFailureReason> = {
  NOT_FOUND: 'model-not-found',
  BAD_USER_INPUT: 'invalid-input',
  INTERNAL_SERVER_ERROR: 'creation-failed',
};

/**
 * 可选细化：后端暴露 extensions.errorCode 时（非生产环境）区分停用型号与普通输入非法。
 * 唯一真源：backend/src/core/common/errors/domain-error.ts 的 REPAIR_REQUEST_ERROR 码组。
 * 后端按契约隐藏该字段时自动回退到大类码映射，不会失效。
 */
const REFINED_REASON_BY_ERROR_CODE: Partial<Record<string, CreateRepairRequestFailureReason>> = {
  REPAIR_REQUEST_EQUIPMENT_MODEL_DISABLED: 'model-disabled',
  REPAIR_REQUEST_INVALID_PARAMS: 'invalid-input',
  INPUT_NORMALIZE_REQUIRED_TEXT_EMPTY: 'invalid-input',
  INPUT_NORMALIZE_INVALID_TEXT: 'invalid-input',
};

const FALLBACK_MESSAGE_BY_REASON: Record<CreateRepairRequestFailureReason, string> = {
  'model-not-found': '所选设备型号不存在，请重新选择。',
  'model-disabled': '所选设备型号已停用，请重新选择。',
  'invalid-input': '输入不符合要求，请检查后重新提交。',
  'creation-failed': '维修申请创建失败，请稍后重试。',
};

type EquipmentModelsData = {
  equipmentModels: EquipmentModelOption[];
};

type CreateRepairRequestData = {
  createRepairRequest: RepairRequestRecord;
};

type GraphQLErrorDetail = {
  /** GraphQL 大类码（extensions.code），契约保证稳定的生产分支信号 */
  code: string | null;
  /** 业务细节码（extensions.errorCode），仅调试/可观测/可选展示，生产可能隐藏 */
  errorCode: string | null;
  /** 后端业务消息（extensions.errorMessage），为空时用前端兜底文案 */
  errorMessage: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 从 ingress error 中读取第一条 GraphQL 错误的业务细节。
 * 生产分支只依赖稳定的 extensions.code；不取顶层通用 message（避免把通用文案当业务消息），
 * 不做任何 Session 读写。
 */
function readGraphQLErrorDetail(error: unknown): GraphQLErrorDetail | null {
  if (!isGraphQLIngressError(error) || !error.graphqlErrors?.length) {
    return null;
  }

  const [firstError] = error.graphqlErrors;
  const extensions = (firstError.extensions as Record<string, unknown> | undefined) || {};

  return {
    code: normalizeOptionalString(extensions.code),
    errorCode: normalizeOptionalString(extensions.errorCode),
    errorMessage: normalizeOptionalString(extensions.errorMessage),
  };
}

/** 查询可创建维修申请的设备型号列表（仅启用型号，后端已按排序返回） */
export async function fetchEquipmentModels(): Promise<EquipmentModelOption[]> {
  const data = await executeGraphQL<EquipmentModelsData, Record<string, never>>(
    EQUIPMENT_MODELS_QUERY,
    {},
  );

  return data.equipmentModels;
}

/**
 * 创建维修申请。
 *
 * - 业务拒绝（型号不存在/停用、输入非法、落库失败）返回显式失败结果，供表单直接展示；
 * - 拒绝原因以稳定的 extensions.code 为主，extensions.errorCode 仅作可选细化，
 *   不依赖 errorCode 做生产运行时分支（见 graphql-error-contract-current.md）；
 * - transport / auth 类失败按共享错误模型上抛 GraphQLIngressError，由调用方决定展示与跳转。
 */
export async function createRepairRequest(
  input: CreateRepairRequestInput,
): Promise<CreateRepairRequestResult> {
  try {
    const data = await executeGraphQL<CreateRepairRequestData, { input: CreateRepairRequestInput }>(
      CREATE_REPAIR_REQUEST_MUTATION,
      { input },
    );

    return { ok: true, repairRequest: data.createRepairRequest };
  } catch (error) {
    const detail = readGraphQLErrorDetail(error);
    const categoryReason = detail?.code ? FAILURE_REASON_BY_CATEGORY_CODE[detail.code] : undefined;

    if (!detail || !categoryReason) {
      throw error;
    }

    const reason =
      (detail.errorCode ? REFINED_REASON_BY_ERROR_CODE[detail.errorCode] : undefined) ??
      categoryReason;

    return {
      ok: false,
      reason,
      message: detail.errorMessage ?? FALLBACK_MESSAGE_BY_REASON[reason],
    };
  }
}
