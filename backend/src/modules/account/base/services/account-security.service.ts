// src/modules/account/base/services/account-security.service.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AccountSecuritySubjectSnapshot } from '@src/modules/account/account.types';
import { PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';

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
   * 验证 metaDigest 与 accessGroup 的一致性
   * @param account 账号实体（包含关联的用户信息）
   * @returns 验证结果和真实的 accessGroup
   */
  validateAccessGroupConsistency(account: AccountSecuritySubjectSnapshot): {
    isValid: boolean;
    realAccessGroup?: IdentityTypeEnum[];
    shouldSuspend: boolean;
  } {
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
   * 创建账号暂停数据
   * @param accountId 账号 ID
   * @param reason 暂停原因
   * @returns 暂停数据对象
   */
  createSuspensionData(accountId: number, reason: string) {
    return {
      accountId,
      reason,
      suspendedAt: new Date(),
      status: AccountStatus.SUSPENDED,
    };
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
   * 暂停账号
   * @param accountId 账号 ID
   * @param reason 暂停原因
   * @returns 是否成功暂停
   */
  async suspendAccount(accountId: number, reason: string): Promise<boolean> {
    try {
      await this.accountRepository.update(accountId, {
        status: AccountStatus.SUSPENDED,
      });

      this.logSecurityEvent({
        accountId,
        eventType: 'ACCOUNT_SUSPENDED',
        details: {
          reason,
          suspendedAt: new Date().toISOString(),
        },
      });

      this.logger.warn({ accountId, reason }, `账号 ${accountId} 已被暂停`);
      return true;
    } catch (error) {
      this.logger.error({ err: error, accountId }, `暂停账号 ${accountId} 失败`);
      return false;
    }
  }

  /**
   * 检查并处理账号安全性
   * @param account 账号实体（包含 userInfo）
   * @returns 处理结果
   */
  checkAndHandleAccountSecurity(account: AccountSecuritySubjectSnapshot): {
    isValid: boolean;
    wasSuspended: boolean;
    realAccessGroup?: IdentityTypeEnum[];
  } {
    const validationResult = this.validateAccessGroupConsistency(account);

    if (!validationResult.isValid && validationResult.shouldSuspend) {
      // 立即记录安全事件，不等待数据库操作
      this.logSecurityEvent({
        accountId: account.id,
        eventType: 'SECURITY_BREACH_DETECTED',
        details: {
          reason: '检测到访问组不一致 - 潜在安全威胁',
          detectedAt: new Date().toISOString(),
          immediateBlock: true,
        },
      });

      // 异步尝试暂停账号，但不等待结果
      this.suspendAccount(account.id, '检测到访问组不一致 - 潜在安全威胁').catch((error: Error) => {
        this.logger.error(
          { err: error, accountId: account.id },
          `在数据库中暂停账号 ${account.id} 失败，但访问仍被阻止`,
        );
      });

      // 无论数据库操作是否成功，都立即阻断访问
      return {
        isValid: false,
        wasSuspended: true, // 强制返回 true，确保流程被阻断
        realAccessGroup: validationResult.realAccessGroup,
      };
    }

    return {
      isValid: validationResult.isValid,
      wasSuspended: false,
      realAccessGroup: validationResult.realAccessGroup,
    };
  }
}
