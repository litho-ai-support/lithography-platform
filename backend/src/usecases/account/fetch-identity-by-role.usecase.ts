// src/usecases/account/fetch-identity-by-role.usecase.ts

import { IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';

export type RawIdentity = { kind: 'NONE' };

@Injectable()
export class FetchIdentityByRoleUsecase {
  execute(_params: { accountId: number; role: IdentityTypeEnum }): Promise<RawIdentity> {
    return Promise.resolve({ kind: 'NONE' });
  }
}
