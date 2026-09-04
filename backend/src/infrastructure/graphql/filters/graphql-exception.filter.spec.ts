import { CAPABILITY_ERROR, DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors';
import type { ArgumentsHost } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import { GqlAllExceptionsFilter } from './graphql-exception.filter';

describe(GqlAllExceptionsFilter.name, () => {
  it('maps capability availability to an internal category instead of authorization failure', () => {
    const configService = {
      get: jest.fn().mockReturnValue('production'),
    } as unknown as ConfigService;
    const host = {
      getType: () => 'graphql',
      getArgs: () => [undefined, {}, {}, { fieldName: 'testField' }],
    } as unknown as ArgumentsHost;
    const filter = new GqlAllExceptionsFilter(configService);

    const error = filter.catch(
      new DomainError(CAPABILITY_ERROR.UNAVAILABLE, 'Capability unavailable'),
      host,
    ) as GraphQLError;

    expect(error.extensions).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      errorCode: CAPABILITY_ERROR.UNAVAILABLE,
    });
  });

  it.each([
    [REPAIR_REQUEST_ERROR.EQUIPMENT_MODEL_NOT_FOUND, 'NOT_FOUND'],
    [REPAIR_REQUEST_ERROR.EQUIPMENT_MODEL_DISABLED, 'BAD_USER_INPUT'],
    [REPAIR_REQUEST_ERROR.INVALID_PARAMS, 'BAD_USER_INPUT'],
    // 系统侧故障不得误报为输入错误
    [REPAIR_REQUEST_ERROR.CREATION_FAILED, 'INTERNAL_SERVER_ERROR'],
    [REPAIR_REQUEST_ERROR.REQUEST_NO_CONFLICT, 'INTERNAL_SERVER_ERROR'],
    // 读取/删除/接单：不可访问统一 NOT_FOUND，已接单互斥 CONFLICT，写入失败属系统故障
    [REPAIR_REQUEST_ERROR.NOT_FOUND, 'NOT_FOUND'],
    [REPAIR_REQUEST_ERROR.ALREADY_ACCEPTED, 'CONFLICT'],
    [REPAIR_REQUEST_ERROR.ACCEPT_FAILED, 'INTERNAL_SERVER_ERROR'],
    [REPAIR_REQUEST_ERROR.DELETION_FAILED, 'INTERNAL_SERVER_ERROR'],
    // 回复：未接单属业务状态冲突 CONFLICT，回复落库失败属系统侧故障
    [REPAIR_REQUEST_ERROR.NOT_ACCEPTED, 'CONFLICT'],
    [REPAIR_REQUEST_ERROR.RESPONSE_FAILED, 'INTERNAL_SERVER_ERROR'],
  ])('maps repair request error %s to GraphQL code %s', (errorCode, gqlCode) => {
    const configService = {
      get: jest.fn().mockReturnValue('production'),
    } as unknown as ConfigService;
    const host = {
      getType: () => 'graphql',
      getArgs: () => [undefined, {}, {}, { fieldName: 'testField' }],
    } as unknown as ArgumentsHost;
    const filter = new GqlAllExceptionsFilter(configService);

    const error = filter.catch(new DomainError(errorCode, '维修申请错误'), host) as GraphQLError;

    expect(error.extensions).toMatchObject({
      code: gqlCode,
      errorCode,
    });
  });
});
