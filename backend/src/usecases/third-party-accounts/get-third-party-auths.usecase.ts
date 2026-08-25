// src/usecases/third-party-accounts/get-third-party-auths.usecase.ts
import { ThirdPartyAuthView } from '@app-types/models/third-party-auth.types';
import { Injectable } from '@nestjs/common';
import { ThirdPartyAuthQueryService } from '@modules/third-party-auth/queries/third-party-auth.query.service';

@Injectable()
export class GetThirdPartyAuthsUsecase {
  constructor(private readonly thirdPartyAuthQueryService: ThirdPartyAuthQueryService) {}

  async execute(params: { accountId: number }): Promise<ThirdPartyAuthView[]> {
    return await this.thirdPartyAuthQueryService.getThirdPartyAuths(params.accountId);
  }
}
