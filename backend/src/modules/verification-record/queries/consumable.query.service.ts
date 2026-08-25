// src/modules/verification-record/queries/consumable.query.service.ts
import { AudienceTypeEnum } from '@app-types/models/account.types';
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { Injectable } from '@nestjs/common';
import type { VerificationRecordView } from '../verification-record.types';
import { VerificationReadQueryService } from './verification-read.query.service';

@Injectable()
export class ConsumableQueryService {
  constructor(private readonly verificationReadQueryService: VerificationReadQueryService) {}

  /**
   * 查找可消费的验证记录
   * @param token 验证 token
   * @param audience 受众类型
   * @param email 邮箱
   * @param phone 手机号
   */
  async findConsumableRecord(
    token: string,
    audience?: AudienceTypeEnum | null,
    email?: string | null,
    phone?: string | null,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<VerificationRecordView> {
    return this.verificationReadQueryService.findConsumableRecord(
      token,
      audience,
      email,
      phone,
      transactionContext,
    );
  }
}
