// src/features/repair-request/infrastructure/engineer-repair-request-adapter.ts

/**
 * 工程师维修申请读写 GraphQL adapter（防腐层）。
 *
 * - 所有请求复用 shared/graphql.executeGraphQL（protected request 默认语义，
 *   Token 注入与 auth 失效宣告由共享链路负责），不直接 fetch、不新建 Apollo Client；
 * - 原始 DTO 只停留在本文件与 ./engineer-repair-request.types.ts；
 *   对外返回经 mapper 归一后的干净模型（可空字段收拢为 null）；
 * - 业务拒绝（接单冲突/不可访问等）返回显式失败结果，
 *   主映射只依赖契约保证稳定的 extensions.code 大类，不依赖生产可能隐藏的
 *   extensions.errorCode 做运行时分支（见 backend/docs/api/graphql-error-contract-current.md）；
 * - transport / auth 类错误仍按共享错误模型上抛 GraphQLIngressError：
 *   普通失败由 application 转用户提示，auth 错误继续交给全局 Session 失效链路。
 */

import { executeGraphQL } from '@/shared/graphql';

import type {
  AcceptRepairRequestFailureReason,
  AcceptRepairRequestResult,
  EngineerRepairListQuery,
  EngineerRepairRequestDetail,
  EngineerRepairRequestDetailFailureReason,
  EngineerRepairRequestDetailResult,
  EngineerRepairRequestEquipmentModel,
  EngineerRepairRequestListItem,
  EngineerRepairRequestPage,
  EngineerRepairRequestResponseItem,
  EngineerResponseDTO,
  EquipmentModelDTO,
  RepairRequestDetailDTO,
  RepairRequestListItemDTO,
  RepairRequestPaginatedDTO,
  RepairRequestPaginationVariables,
} from './engineer-repair-request.types';
import { readGraphQLErrorDetail } from './repair-request-adapter';

const ENGINEER_REPAIR_REQUESTS_QUERY = `
  query EngineerRepairRequests($scope: String!, $pagination: PaginationArgs!) {
    engineerRepairRequests(scope: $scope, pagination: $pagination) {
      items {
        id
        requestNo
        equipmentModel { id modelCode modelName }
        errorCode
        createdAt
        isAccepted
        acceptedAt
        latestResolutionStatus
      }
      total
      page
      pageSize
    }
  }
`;

const ENGINEER_REPAIR_REQUEST_DETAIL_QUERY = `
  query EngineerRepairRequest($id: Int!) {
    engineerRepairRequest(id: $id) {
      id
      requestNo
      equipmentModel { id modelCode modelName }
      errorCode
      faultDescription
      contentMd
      createdAt
      isAccepted
      acceptedAt
      latestResolutionStatus
      responses {
        id
        engineerNickname
        resolutionStatus
        responseText
        createdAt
      }
    }
  }
`;

const ACCEPT_REPAIR_REQUEST_MUTATION = `
  mutation AcceptRepairRequest($id: Int!) {
    acceptRepairRequest(id: $id) {
      id
      requestNo
      equipmentModel { id modelCode modelName }
      errorCode
      faultDescription
      contentMd
      createdAt
      isAccepted
      acceptedAt
      latestResolutionStatus
      responses {
        id
        engineerNickname
        resolutionStatus
        responseText
        createdAt
      }
    }
  }
`;

/* -------------------------- 业务拒绝映射 -------------------------- */

/**
 * 接单拒绝主映射：仅依赖 extensions.code 大类（契约保证稳定的生产分支信号）。
 * 唯一真源：后端全局 GraphQL Filter 的 mapDomainErrorToGqlCode 与
 * REPAIR_REQUEST_ERROR / PERMISSION_ERROR 码组。
 */
const ACCEPT_FAILURE_REASON_BY_CATEGORY_CODE: Record<string, AcceptRepairRequestFailureReason> = {
  CONFLICT: 'already-accepted',
  NOT_FOUND: 'not-accessible',
  FORBIDDEN: 'insufficient-permission',
  INTERNAL_SERVER_ERROR: 'accept-failed',
  BAD_USER_INPUT: 'accept-failed',
};

/** 可选细化：后端暴露 extensions.errorCode 时（非生产环境）细化接单冲突提示；隐藏时自动回退大类 */
const ACCEPT_REFINED_REASON_BY_ERROR_CODE: Partial<
  Record<string, AcceptRepairRequestFailureReason>
> = {
  REPAIR_REQUEST_ALREADY_ACCEPTED: 'already-accepted',
};

const ACCEPT_FALLBACK_MESSAGE_BY_REASON: Record<AcceptRepairRequestFailureReason, string> = {
  // 中性文案：最小快照不读接单人，无法区分本人重复接单与他人接单，不向前端引入工程师 ID 来区分；
  // 兜底与后端 DomainError message 同一句且同样不带句号（主展示路径为后端 errorMessage，
  // 两条展示路径的用户可见文案保持一致）
  'already-accepted': '该维修申请已被接单，请刷新后查看最新状态',
  'not-accessible': '维修申请不存在或已删除。',
  'insufficient-permission': '当前账号无权接单维修申请。',
  'accept-failed': '接单失败，请稍后重试。',
};

/**
 * 详情读取拒绝主映射：后端对越权统一拒绝且不泄露存在性，
 * NOT_FOUND / FORBIDDEN 合并为统一不可访问反馈，不区分属于哪位工程师。
 */
const DETAIL_FAILURE_REASON_BY_CATEGORY_CODE: Record<
  string,
  EngineerRepairRequestDetailFailureReason
> = {
  NOT_FOUND: 'not-accessible',
  FORBIDDEN: 'not-accessible',
  INTERNAL_SERVER_ERROR: 'load-failed',
  BAD_USER_INPUT: 'load-failed',
};

/**
 * 统一不可访问文案的唯一真源：后端对越权统一拒绝且不泄露存在性，
 * adapter 兜底文案与详情流程对无效/非法 ID 的静态反馈共用同一句，不复制第二份。
 */
export const ENGINEER_DETAIL_NOT_ACCESSIBLE_MESSAGE = '维修申请不存在，或当前账号无权查看。';

const DETAIL_FALLBACK_MESSAGE_BY_REASON: Record<EngineerRepairRequestDetailFailureReason, string> =
  {
    'not-accessible': ENGINEER_DETAIL_NOT_ACCESSIBLE_MESSAGE,
    'load-failed': '维修申请详情加载失败，请稍后重试。',
  };

/* ------------------------------ mapper ------------------------------ */

type EngineerRepairRequestsData = {
  engineerRepairRequests: RepairRequestPaginatedDTO;
};

type EngineerRepairRequestDetailData = {
  engineerRepairRequest: RepairRequestDetailDTO;
};

type AcceptRepairRequestData = {
  acceptRepairRequest: RepairRequestDetailDTO;
};

function mapEquipmentModelDTO(dto: EquipmentModelDTO): EngineerRepairRequestEquipmentModel {
  return { id: dto.id, modelCode: dto.modelCode, modelName: dto.modelName };
}

function mapResponseDTO(dto: EngineerResponseDTO): EngineerRepairRequestResponseItem {
  return {
    id: dto.id,
    engineerNickname: dto.engineerNickname,
    resolutionStatus: dto.resolutionStatus,
    responseText: dto.responseText,
    createdAt: dto.createdAt,
  };
}

function mapListItemDTO(dto: RepairRequestListItemDTO): EngineerRepairRequestListItem {
  return {
    id: dto.id,
    requestNo: dto.requestNo,
    equipmentModel: mapEquipmentModelDTO(dto.equipmentModel),
    errorCode: dto.errorCode,
    createdAt: dto.createdAt,
    isAccepted: dto.isAccepted,
    acceptedAt: dto.acceptedAt ?? null,
    latestResolutionStatus: dto.latestResolutionStatus ?? null,
  };
}

function mapDetailDTO(dto: RepairRequestDetailDTO): EngineerRepairRequestDetail {
  return {
    id: dto.id,
    requestNo: dto.requestNo,
    equipmentModel: mapEquipmentModelDTO(dto.equipmentModel),
    errorCode: dto.errorCode,
    faultDescription: dto.faultDescription,
    contentMd: dto.contentMd,
    createdAt: dto.createdAt,
    isAccepted: dto.isAccepted,
    acceptedAt: dto.acceptedAt ?? null,
    latestResolutionStatus: dto.latestResolutionStatus ?? null,
    // 防腐兜底：可空/缺省字段归一，不假设后端字段必达（infrastructure-rules.md）
    responses: (dto.responses ?? []).map(mapResponseDTO),
  };
}

/* ------------------------------ 查询 ------------------------------ */

/**
 * 查询工程师维修申请列表（scope = AVAILABLE 待接单 / MINE 我的接单）。
 * transport / auth 失败上抛 GraphQLIngressError，由 application 转用户提示或交全局链路。
 */
export async function fetchEngineerRepairRequests(
  query: EngineerRepairListQuery,
): Promise<EngineerRepairRequestPage> {
  const pagination: RepairRequestPaginationVariables = {
    mode: 'OFFSET',
    page: query.page,
    pageSize: query.pageSize,
    withTotal: true,
  };
  const data = await executeGraphQL<
    EngineerRepairRequestsData,
    { scope: string; pagination: RepairRequestPaginationVariables }
  >(ENGINEER_REPAIR_REQUESTS_QUERY, { scope: query.scope, pagination });
  const page = data.engineerRepairRequests;

  // 防腐兜底：分页字段缺省时回落查询参数，不向 application 泄出 undefined
  return {
    items: (page.items ?? []).map(mapListItemDTO),
    total: page.total ?? 0,
    page: page.page ?? query.page,
    pageSize: page.pageSize ?? query.pageSize,
  };
}

/**
 * 查询工程师维修申请详情。
 *
 * - 业务拒绝（不存在/已删除/越权/系统失败）返回显式失败结果，供详情页统一展示；
 * - transport / auth 类失败按共享错误模型上抛，由调用方决定展示与跳转。
 */
export async function fetchEngineerRepairRequestDetail(
  id: number,
): Promise<EngineerRepairRequestDetailResult> {
  try {
    const data = await executeGraphQL<EngineerRepairRequestDetailData, { id: number }>(
      ENGINEER_REPAIR_REQUEST_DETAIL_QUERY,
      { id },
    );

    return { ok: true, detail: mapDetailDTO(data.engineerRepairRequest) };
  } catch (error) {
    const detail = readGraphQLErrorDetail(error);
    const categoryReason = detail?.code
      ? DETAIL_FAILURE_REASON_BY_CATEGORY_CODE[detail.code]
      : undefined;

    if (!detail || !categoryReason) {
      throw error;
    }

    return {
      ok: false,
      reason: categoryReason,
      message: detail.errorMessage ?? DETAIL_FALLBACK_MESSAGE_BY_REASON[categoryReason],
    };
  }
}

/* ------------------------------ 接单 ------------------------------ */

/**
 * 工程师接单（后端原子条件更新，竞争时仅一方成功）。
 *
 * - 入参只有维修申请 ID；接单工程师与接单时间取自后端 Session/系统时间，前端不可传入；
 * - 业务拒绝返回显式失败结果：大类 CONFLICT 是稳定运行时分支（申请已被接单），
 *   REPAIR_REQUEST_ALREADY_ACCEPTED 细节码仅用于可选细化，生产隐藏时自动回退；
 * - transport / auth 类失败按共享错误模型上抛。
 */
export async function acceptRepairRequest(id: number): Promise<AcceptRepairRequestResult> {
  try {
    const data = await executeGraphQL<AcceptRepairRequestData, { id: number }>(
      ACCEPT_REPAIR_REQUEST_MUTATION,
      { id },
    );

    return { ok: true, detail: mapDetailDTO(data.acceptRepairRequest) };
  } catch (error) {
    const detail = readGraphQLErrorDetail(error);
    const categoryReason = detail?.code
      ? ACCEPT_FAILURE_REASON_BY_CATEGORY_CODE[detail.code]
      : undefined;

    if (!detail || !categoryReason) {
      throw error;
    }

    const reason =
      (detail.errorCode ? ACCEPT_REFINED_REASON_BY_ERROR_CODE[detail.errorCode] : undefined) ??
      categoryReason;

    return {
      ok: false,
      reason,
      message: detail.errorMessage ?? ACCEPT_FALLBACK_MESSAGE_BY_REASON[reason],
    };
  }
}
