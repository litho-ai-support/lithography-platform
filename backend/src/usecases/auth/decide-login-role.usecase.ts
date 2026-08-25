// src/usecases/auth/decide-login-role.usecase.ts

import { AudienceTypeEnum, IdentityTypeEnum } from '@app-types/models/account.types';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import {
  DecideLoginRoleInput,
  DecideLoginRoleOutput,
  IDecideLoginRoleUsecase,
  LoginRoleDecisionAudit,
} from '@app-types/auth/login-flow.types';

/**
 * 登录角色决策用例
 * 职责：根据 roleFromHint 和 accessGroup 决策最终角色，并记录审计日志
 */
@Injectable()
export class DecideLoginRoleUsecase implements IDecideLoginRoleUsecase {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(DecideLoginRoleUsecase.name);
  }

  /**
   * 执行角色决策逻辑
   * @param input 角色决策输入参数
   * @param context 请求上下文信息
   * @returns 角色决策结果
   */
  execute(
    input: DecideLoginRoleInput,
    context: {
      accountId: number;
      ip: string;
      userAgent: string;
      audience: AudienceTypeEnum;
    },
  ): DecideLoginRoleOutput {
    const { roleFromHint, accessGroup } = input;
    const { accountId, ip, userAgent, audience } = context;

    let finalRole: IdentityTypeEnum;
    let reason: 'hint' | 'fallback';

    // 角色决策逻辑
    if (roleFromHint && this.isRoleInAccessGroup(roleFromHint, accessGroup)) {
      // 策略 1: roleFromHint ∈ accessGroup → 采用 roleFromHint
      finalRole = roleFromHint;
      reason = 'hint';
    } else {
      // 策略 2: 否则 → 直接回退到 REGISTRANT（安全默认）
      finalRole = IdentityTypeEnum.REGISTRANT;
      reason = 'fallback';
    }

    // 如果发生回退，额外记录详细回退原因，便于快速定位
    if (reason === 'fallback') {
      const fallbackCause = this.getFallbackCause(roleFromHint, accessGroup);
      this.logger.warn(
        {
          event: 'login_role_fallback',
          accountId,
          audience,
          roleFromHint,
          fallbackCause,
          accessGroupHash: this.hashAccessGroup(accessGroup),
          accessGroupSnapshot: accessGroup,
          accessGroupSize: Array.isArray(accessGroup) ? accessGroup.length : -1,
          ip,
          userAgent,
          timestamp: new Date().toISOString(),
        },
        `登录角色回退: 账户=${accountId}, 提示身份=${roleFromHint ?? 'NULL'}, 原因=${fallbackCause}, 最终=${finalRole}`,
      );
    }

    // 记录审计日志
    this.recordAuditLog({
      accountId,
      audience,
      roleFromHint,
      accessGroupHash: this.hashAccessGroup(accessGroup),
      finalRole,
      reason,
      ip,
      userAgent,
      timestamp: new Date(),
    });

    return {
      finalRole,
      reason,
    };
  }

  /**
   * 检查角色是否在访问组中
   * @param role 角色
   * @param accessGroup 访问组
   * @returns 是否包含该角色
   */
  private isRoleInAccessGroup(role: IdentityTypeEnum, accessGroup: IdentityTypeEnum[]): boolean {
    // 简化为恒等匹配
    return accessGroup.includes(role);
  }

  /**
   * 生成访问组的哈希值（用于审计日志，避免敏感信息泄露）
   * @param accessGroup 访问组
   * @returns 哈希值
   */
  private hashAccessGroup(accessGroup: IdentityTypeEnum[]): string {
    const sortedGroups = [...accessGroup].sort().join(',');
    return createHash('sha256').update(sortedGroups).digest('hex').substring(0, 16);
  }

  // 新增：角色回退原因分析，帮助快速定位问题
  private getFallbackCause(
    roleFromHint: IdentityTypeEnum | null,
    accessGroup: IdentityTypeEnum[],
  ): string {
    if (!Array.isArray(accessGroup) || accessGroup.length === 0) {
      return roleFromHint ? 'access_group_empty_with_hint' : 'access_group_empty_hint_absent';
    }
    if (!roleFromHint) {
      return 'hint_absent';
    }
    return this.isRoleInAccessGroup(roleFromHint, accessGroup)
      ? 'unexpected' // 理论上不会触发（只在回退时调用）
      : 'hint_not_in_access_group';
  }

  /**
   * 记录审计日志
   * @param auditData 审计数据
   */
  private recordAuditLog(auditData: LoginRoleDecisionAudit): void {
    this.logger.info(
      {
        event: 'login_role_decision',
        accountId: auditData.accountId,
        audience: auditData.audience,
        roleFromHint: auditData.roleFromHint,
        accessGroupHash: auditData.accessGroupHash,
        finalRole: auditData.finalRole,
        reason: auditData.reason,
        ip: auditData.ip,
        userAgent: auditData.userAgent,
        timestamp: auditData.timestamp.toISOString(),
      },
      `登录角色决策: 账户=${auditData.accountId}, 最终角色=${auditData.finalRole}, 原因=${auditData.reason}`,
    );
  }
}
