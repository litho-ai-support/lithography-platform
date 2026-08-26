// src/features/repair-request/repair-request-adapter.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as sharedGraphql from '@/shared/graphql';
import { GraphQLIngressError } from '@/shared/graphql';

import { createRepairRequest, fetchEquipmentModels } from './index';

vi.mock('@/shared/graphql', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedGraphql>();

  return {
    ...actual,
    executeGraphQL: vi.fn(),
  };
});

const executeGraphQLMock = vi.mocked(sharedGraphql.executeGraphQL);

const REPAIR_REQUEST_RECORD = {
  id: 1,
  requestNo: 'RR20260826000000ABC123',
  equipmentModelId: 21,
  errorCode: 'E-2001',
  faultDescription: '双工件台干涉仪报错',
  createdAt: '2026-08-26T00:00:00.000Z',
  isAccepted: false,
};

function buildDomainIngressError(options: {
  code: string;
  errorCode: string;
  errorMessage?: string;
}) {
  return new GraphQLIngressError({
    type: 'graphql',
    message: options.errorMessage ?? '请求处理失败。',
    graphqlErrors: [
      {
        message: options.errorMessage ?? '请求处理失败。',
        extensions: {
          code: options.code,
          errorCode: options.errorCode,
          ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
        },
      },
    ],
  });
}

beforeEach(() => {
  executeGraphQLMock.mockReset();
});

describe('fetchEquipmentModels', () => {
  it('返回后端给出的型号列表', async () => {
    executeGraphQLMock.mockResolvedValue({
      equipmentModels: [{ id: 12, modelCode: 'LITHO-A', modelName: '型号A' }],
    });

    await expect(fetchEquipmentModels()).resolves.toEqual([
      { id: 12, modelCode: 'LITHO-A', modelName: '型号A' },
    ]);
  });

  it('transport 失败时上抛 GraphQLIngressError', async () => {
    const networkError = new GraphQLIngressError({ type: 'network', message: 'fetch failed' });
    executeGraphQLMock.mockRejectedValue(networkError);

    await expect(fetchEquipmentModels()).rejects.toBe(networkError);
  });
});

describe('createRepairRequest', () => {
  const input = { equipmentModelId: 21, errorCode: 'E-2001', faultDescription: '报错描述' };

  it('创建成功返回完整申请记录', async () => {
    executeGraphQLMock.mockResolvedValue({ createRepairRequest: REPAIR_REQUEST_RECORD });

    await expect(createRepairRequest(input)).resolves.toEqual({
      ok: true,
      repairRequest: REPAIR_REQUEST_RECORD,
    });
    expect(executeGraphQLMock).toHaveBeenCalledWith(
      expect.stringContaining('createRepairRequest'),
      { input },
    );
  });

  it.each([
    [
      'NOT_FOUND',
      'REPAIR_REQUEST_EQUIPMENT_MODEL_NOT_FOUND',
      'model-not-found',
      '所选设备型号不存在。',
    ],
    [
      'BAD_USER_INPUT',
      'REPAIR_REQUEST_EQUIPMENT_MODEL_DISABLED',
      'model-disabled',
      '所选设备型号已停用。',
    ],
    [
      'BAD_USER_INPUT',
      'REPAIR_REQUEST_INVALID_PARAMS',
      'invalid-input',
      '错误码不能超过 100 个字符。',
    ],
    [
      'BAD_USER_INPUT',
      'INPUT_NORMALIZE_REQUIRED_TEXT_EMPTY',
      'invalid-input',
      '设备错误码不能为空。',
    ],
    [
      'INTERNAL_SERVER_ERROR',
      'REPAIR_REQUEST_CREATION_FAILED',
      'creation-failed',
      '维修申请保存失败。',
    ],
  ])(
    '业务拒绝大类码 %s（errorCode=%s）映射为 reason=%s 且优先使用后端消息',
    async (code, errorCode, reason, errorMessage) => {
      executeGraphQLMock.mockRejectedValue(
        buildDomainIngressError({ errorCode, code, errorMessage }),
      );

      await expect(createRepairRequest(input)).resolves.toEqual({
        ok: false,
        reason,
        message: errorMessage,
      });
    },
  );

  it.each([
    ['NOT_FOUND', 'model-not-found', '所选设备型号不存在，请重新选择。'],
    ['BAD_USER_INPUT', 'invalid-input', '输入不符合要求，请检查后重新提交。'],
    ['INTERNAL_SERVER_ERROR', 'creation-failed', '维修申请创建失败，请稍后重试。'],
  ])(
    '生产环境省略 errorCode 时，仅凭大类码 %s 仍能映射并走兜底文案',
    async (code, reason, message) => {
      executeGraphQLMock.mockRejectedValue(buildDomainIngressError({ code, errorCode: '' }));

      await expect(createRepairRequest(input)).resolves.toEqual({ ok: false, reason, message });
    },
  );

  it('后端未提供业务消息时使用前端兜底文案', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildDomainIngressError({
        errorCode: 'REPAIR_REQUEST_CREATION_FAILED',
        code: 'INTERNAL_SERVER_ERROR',
      }),
    );

    await expect(createRepairRequest(input)).resolves.toEqual({
      ok: false,
      reason: 'creation-failed',
      message: '维修申请创建失败，请稍后重试。',
    });
  });

  it('errorCode 未收录细化表时回退到大类码映射（新增后端码不击穿前端）', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildDomainIngressError({
        code: 'BAD_USER_INPUT',
        errorCode: 'REPAIR_REQUEST_FUTURE_CODE',
        errorMessage: '后端新增的业务拒绝消息。',
      }),
    );

    await expect(createRepairRequest(input)).resolves.toEqual({
      ok: false,
      reason: 'invalid-input',
      message: '后端新增的业务拒绝消息。',
    });
  });

  it('errorMessage 为空白时视同未提供，走前端兜底文案', async () => {
    executeGraphQLMock.mockRejectedValue(
      buildDomainIngressError({
        code: 'NOT_FOUND',
        errorCode: 'REPAIR_REQUEST_EQUIPMENT_MODEL_NOT_FOUND',
        errorMessage: '   ',
      }),
    );

    await expect(createRepairRequest(input)).resolves.toEqual({
      ok: false,
      reason: 'model-not-found',
      message: '所选设备型号不存在，请重新选择。',
    });
  });

  it('存在多条 GraphQL 错误时仅以首条为映射依据', async () => {
    const domainError = buildDomainIngressError({
      code: 'NOT_FOUND',
      errorCode: 'REPAIR_REQUEST_EQUIPMENT_MODEL_NOT_FOUND',
    });
    const mappedError = buildDomainIngressError({
      code: 'BAD_USER_INPUT',
      errorCode: 'REPAIR_REQUEST_INVALID_PARAMS',
    });
    executeGraphQLMock.mockRejectedValue(
      new GraphQLIngressError({
        type: 'graphql',
        message: 'multiple errors',
        graphqlErrors: [...domainError.graphqlErrors!, ...mappedError.graphqlErrors!],
      }),
    );

    await expect(createRepairRequest(input)).resolves.toMatchObject({
      ok: false,
      reason: 'model-not-found',
    });
  });

  it('非业务拒绝大类码（如 GRAPHQL_VALIDATION_FAILED）上抛原始错误，不误判为业务拒绝', async () => {
    const unknownError = buildDomainIngressError({
      errorCode: 'SOME_UNKNOWN_CODE',
      code: 'GRAPHQL_VALIDATION_FAILED',
    });
    executeGraphQLMock.mockRejectedValue(unknownError);

    await expect(createRepairRequest(input)).rejects.toBe(unknownError);
  });

  it('auth 失败上抛原始错误，不吞为业务拒绝', async () => {
    const authError = new GraphQLIngressError({ type: 'auth', message: 'token invalid' });
    executeGraphQLMock.mockRejectedValue(authError);

    await expect(createRepairRequest(input)).rejects.toBe(authError);
  });
});
