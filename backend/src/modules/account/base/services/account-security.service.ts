// src/modules/account/base/services/account-security.service.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AccountSecuritySubjectSnapshot } from '@src/modules/account/account.types';
import { PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';

/**
 * 访问组一致性校验结果（纯判断输出，不含任何写入副作用）
 */
export interface AccountSecurityValidationResult {
  isValid: boolean;
  realAccessGroup?: IdentityTypeEnum[];
  shouldSuspend: boolean;
}

@Injectable()
export class AccountSecurityService {
  constructor(
    // 移除 FieldEncryptionService 注入
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AccountSecurityService.name);
  }

  /**
   * 验证 metaDigest 与 accessGroup 的一致性（纯判断，不产生写入副作用）
   * @param account 账号安全主体快照（包含关联的用户信息）
   * @returns 验证结果和真实的 accessGroup
   */
  validateAccessGroupConsistency(
    account: AccountSecuritySubjectSnapshot,
  ): AccountSecurityValidationResult {
    try {
      const metaDigestValue = account.userInfo.metaDigest;

      if (!metaDigestValue) {
        this.logger.error({ accountId: account.id }, `账号 ${account.id} 的 metaDigest 为空`);
        return {
          isValid: false,
          shouldSuspend: true,
        };
      }

      const realAccessGroup = metaDigestValue;

      if (!Array.isArray(realAccessGroup)) {
        this.logger.error(
          { accountId: account.id, metaDigest: metaDigestValue },
          `账号 ${account.id} 的 metaDigest 格式无效，应为数组`,
        );
        return {
          isValid: false,
          shouldSuspend: true,
        };
      }

      const accessGroupStr = JSON.stringify(account.userInfo.accessGroup);
      const realAccessGroupStr = JSON.stringify(realAccessGroup);

      const isConsistent = accessGroupStr === realAccessGroupStr;

      if (!isConsistent) {
        // 记录严重安全错误
        this.logger.error(
          {
            accountId: account.id,
            storedAccessGroup: account.userInfo.accessGroup,
            realAccessGroup,
            timestamp: new Date().toISOString(),
          },
          `检测到账号 ${account.id} 的访问组不一致：存储=${JSON.stringify(account.userInfo.accessGroup)}，实际=${JSON.stringify(realAccessGroup)}`,
        );

        return {
          isValid: false,
          realAccessGroup,
          shouldSuspend: true,
        };
      }

      return {
        isValid: true,
        realAccessGroup,
        shouldSuspend: false,
      };
    } catch (error) {
      this.logger.error(
        { err: error, accountId: account.id },
        `验证账号 ${account.id} 的访问组一致性失败`,
      );

      return {
        isValid: false,
        shouldSuspend: true,
      };
    }
  }

  /**
   * 记录安全事件
   * @param event 安全事件信息
   */
  logSecurityEvent(event: {
    accountId: number;
    eventType: string;
    details: Record<string, unknown>;
  }) {
    this.logger.error(
      {
        accountId: event.accountId,
        ...event.details,
        timestamp: new Date().toISOString(),
      },
      `安全事件：${event.eventType}`,
    );
  }

  /**
   * 暂停账号（细粒度写操作，仅负责落库）
   * 是否暂停、是否等待结果、失败如何处理由调用方 Usecase 编排决定
   * @param accountId 账号 ID
   * @throws 持久化失败时向调用方抛出错误
   */
  async suspendAccount(accountId: number): Promise<void> {
    await this.accountRepository.update(accountId, {
      status: AccountStatus.SUSPENDED,
    });
  }
}
