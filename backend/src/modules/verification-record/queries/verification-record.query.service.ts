// src/modules/verification-record/queries/verification-record.query.service.ts
import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import { VerificationRecordType } from '@app-types/models/verification-record.types';
import { Injectable } from '@nestjs/common';
import type {
  VerificationRecordDetailView,
  VerificationRecordView,
} from '../verification-record.types';
import { VerificationRecordEntity } from '../verification-record.entity';
import { VerificationReadQueryService } from './verification-read.query.service';

export type {
  VerificationRecordDetailView,
  VerificationRecordView,
} from '../verification-record.types';

@Injectable()
export class VerificationRecordQueryService {
  constructor(private readonly verificationReadQueryService: VerificationReadQueryService) {}

  async isTokenExists(
    token: string,
    transactionContext?: PersistenceTransactionContext,
  ): Promise<boolean> {
    return await this.verificationReadQueryService.isTokenExists(token, transactionContext);
  }

  async findActiveConsumableByToken(params: {
    token: string;
    forAccountId?: number;
    expectedType?: VerificationRecordType;
    ignoreTargetRestriction?: boolean;
    now?: Date;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<VerificationRecordView | null> {
    return await this.verificationReadQueryService.findActiveConsumableByToken(params);
  }

  async findActiveConsumableById(params: {
    recordId: number;
    forAccountId?: number;
    expectedType?: VerificationRecordType;
    ignoreTargetRestriction?: boolean;
    now?: Date;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<VerificationRecordView | null> {
    return await this.verificationReadQueryService.findActiveConsumableById(params);
  }

  async getTargetAccountIdByRecordId(params: {
    recordId: number;
    transactionContext?: PersistenceTransactionContext;
  }): Promise<number | null> {
    return await this.verificationReadQueryService.getTargetAccountIdByRecordId(params);
  }

  toCleanView(record: VerificationRecordEntity): VerificationRecordView {
    return this.verificationReadQueryService.toCleanView(record);
  }

  toDetailView(record: VerificationRecordEntity): VerificationRecordDetailView {
    return this.verificationReadQueryService.toDetailView(record);
  }
}
