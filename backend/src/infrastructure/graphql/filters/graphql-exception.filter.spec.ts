import { CAPABILITY_ERROR, DomainError } from '@core/common/errors';
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
});
