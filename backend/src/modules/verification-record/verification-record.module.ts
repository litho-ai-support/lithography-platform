import { VerificationCodeHelper } from './verification-code.helper';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumableQueryService } from './queries/consumable.query.service';
import { VerificationReadQueryService } from './queries/verification-read.query.service';
import { VerificationRecordQueryService } from './queries/verification-record.query.service';
import { VerificationRecordReadRepository } from './repositories/verification-record.read.repo';
import { VerificationRecordEntity } from './verification-record.entity';
import { VerificationRecordService } from './verification-record.service';
import { IdentityVerificationCapabilityAnchor } from './verification-record.capability';

/**
 * 验证记录模块
 * 提供统一的验证/邀请记录管理功能
 */
@Module({
  imports: [TypeOrmModule.forFeature([VerificationRecordEntity])],
  providers: [
    IdentityVerificationCapabilityAnchor,
    VerificationRecordService,
    VerificationRecordReadRepository,
    VerificationReadQueryService,
    ConsumableQueryService,
    VerificationRecordQueryService,
    VerificationCodeHelper,
  ],
  exports: [
    TypeOrmModule,
    VerificationRecordService,
    VerificationRecordReadRepository,
    ConsumableQueryService,
    VerificationRecordQueryService,
    VerificationCodeHelper,
  ],
})
export class VerificationRecordModule {}
