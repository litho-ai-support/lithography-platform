// 文件位置：src/usecases/account/get-account-by-id.usecase.ts
import { UsecaseSession } from '@app-types/auth/session.types';
import { Injectable } from '@nestjs/common';
import { AccountQueryService } from '@src/modules/account/queries/account.query.service';

type AccountDetail = Awaited<ReturnType<AccountQueryService['getAccountById']>>;

@Injectable()
export class GetAccountByIdUsecase {
  constructor(private readonly accountQueryService: AccountQueryService) {}

  /**
   * 获取账户详情
   * @param params 查询参数
   */
  async execute(params: {
    session: UsecaseSession;
    targetAccountId: number;
  }): Promise<AccountDetail> {
    return await this.accountQueryService.getAccountById(params);
  }
}
