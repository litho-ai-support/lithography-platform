// src/usecases/verification-record/create-verification-record.usecase.ts

import {
  CreateVerificationRecordParams,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { DomainError, VERIFICATION_RECORD_ERROR } from '@core/common/errors/domain-error';
import { VerificationCodeHelper } from '@modules/verification-record/verification-code.helper';
import { Injectable } from '@nestjs/common';
import {
  VerificationRecordDetailView,
  VerificationRecordQueryService,
} from '@src/modules/verification-record/queries/verification-record.query.service';
import { VerificationRecordService } from '@src/modules/verification-record/verification-record.service';

/**
 * 创建验证记录用例参数
 */
export interface CreateVerificationRecordUsecaseParams extends Omit<
  CreateVerificationRecordParams,
  'token'
> {
  /** 自定义 token（可选，不提供则自动生成） */
  customToken?: string;
  /** token 长度（仅在自动生成时有效，默认 32） */
  tokenLength?: number;
  /** 是否生成数字验证码（默认 false，生成随机字符串） */
  generateNumericCode?: boolean;
  /** 数字验证码长度（仅在 generateNumericCode 为 true 时有效，默认 6） */
  numericCodeLength?: number;
}

/**
 * 创建验证记录用例结果
 */
export interface CreateVerificationRecordUsecaseResult {
  /** 创建的验证记录实体 */
  record: VerificationRecordDetailView;
  /** 生成的明文 token */
  token: string;
  /** 是否由服务端生成 token（true: 自动生成, false: 使用自定义 token） */
  generatedByServer: boolean;
}

/**
 * 创建验证记录用例
 * 提供灵活的验证记录生成功能，支持自定义各种参数
 */
@Injectable()
export class CreateVerificationRecordUsecase {
  private readonly supportedTypes = new Set<VerificationRecordType>([
    VerificationRecordType.PASSWORD_RESET,
  ]);

  constructor(
    private readonly verificationRecordService: VerificationRecordService,
    private readonly verificationCodeHelper: VerificationCodeHelper,
    private readonly verificationRecordQueryService: VerificationRecordQueryService,
  ) {}

  /**
   * 执行验证记录创建
   * @param params 创建参数
   * @returns 创建结果，包含记录实体和生成的 token
   */
  async execute(
    params: CreateVerificationRecordUsecaseParams,
  ): Promise<CreateVerificationRecordUsecaseResult> {
    // 验证参数
    this.validateParams(params);

    // 生成或使用自定义 token
    let token = params.customToken || this.generateToken(params);
    const generatedByServer = !params.customToken;

    // 检查是否已存在相同的 token（防重复）
    const tokenExists = await this.verificationRecordQueryService.isTokenExists(token);
    if (tokenExists) {
      // 如果是自定义 token，直接抛错
      if (params.customToken) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.CREATION_FAILED,
          '验证记录创建失败：自定义 token 已存在',
          {
            type: params.type,
            targetAccountId: params.targetAccountId,
            issuedByAccountId: params.issuedByAccountId,
          },
        );
      }

      // 如果是自动生成的 token 冲突，重新生成（最多重试 3 次）
      let retryCount = 0;
      let newToken = token;
      while (retryCount < 3) {
        newToken = this.generateToken(params);
        const retryTokenExists = await this.verificationRecordQueryService.isTokenExists(newToken);
        if (!retryTokenExists) {
          break;
        }
        retryCount++;
      }

      if (retryCount >= 3) {
        throw new DomainError(
          VERIFICATION_RECORD_ERROR.CREATION_FAILED,
          '验证记录创建失败：token 生成冲突，重试次数已达上限',
          {
            type: params.type,
            targetAccountId: params.targetAccountId,
            issuedByAccountId: params.issuedByAccountId,
            retryCount,
          },
        );
      }

      token = newToken;
    }

    // 创建记录
    const record = await this.verificationRecordService.createRecord({
      ...params,
      token,
    });

    return {
      record: this.verificationRecordQueryService.toDetailView(record),
      token,
      generatedByServer,
    };
  }

  /**
   * 验证参数
   * @param params 创建参数
   */
  private validateParams(params: CreateVerificationRecordUsecaseParams): void {
    this.validateRequiredParams(params);
    this.validateTimeParams(params);
    this.validateCustomToken(params.customToken);
    this.validateTokenLength(params.tokenLength);
    this.validateNumericCodeLength(params.numericCodeLength);
  }

  private validateRequiredParams(params: CreateVerificationRecordUsecaseParams): void {
    if (!params.type) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：缺少记录类型',
      );
    }

    if (!this.supportedTypes.has(params.type)) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.OPERATION_NOT_SUPPORTED,
        '验证记录创建失败：暂不支持该记录类型',
        { type: params.type },
      );
    }

    if (!params.expiresAt) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：缺少过期时间',
      );
    }
  }

  private validateTimeParams(params: CreateVerificationRecordUsecaseParams): void {
    if (params.expiresAt <= new Date()) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：过期时间不能是过去时间',
        { expiresAt: params.expiresAt },
      );
    }

    if (params.notBefore && params.notBefore >= params.expiresAt) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：生效时间不能晚于或等于过期时间',
        { notBefore: params.notBefore, expiresAt: params.expiresAt },
      );
    }
  }

  private validateCustomToken(customToken?: string): void {
    if (!customToken) {
      return;
    }

    if (customToken.length < 4) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：自定义 token 长度不能少于 4 位',
        { customTokenLength: customToken.length },
      );
    }

    if (customToken.length > 255) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：自定义 token 长度不能超过 255 位',
        { customTokenLength: customToken.length },
      );
    }
  }

  private validateTokenLength(tokenLength?: number): void {
    if (tokenLength === undefined) {
      return;
    }

    if (tokenLength < 4 || tokenLength > 255) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：token 长度必须在 4-255 之间',
        { tokenLength },
      );
    }
  }

  private validateNumericCodeLength(numericCodeLength?: number): void {
    if (numericCodeLength === undefined) {
      return;
    }

    if (numericCodeLength < 4 || numericCodeLength > 12) {
      throw new DomainError(
        VERIFICATION_RECORD_ERROR.CREATION_FAILED,
        '验证记录创建失败：数字验证码长度必须在 4-12 之间',
        { numericCodeLength },
      );
    }
  }

  /**
   * 生成 token
   * 根据参数生成随机字符串或数字验证码
   * @param params 创建参数
   * @returns 生成的 token
   */
  private generateToken(params: CreateVerificationRecordUsecaseParams): string {
    if (params.generateNumericCode) {
      // 生成数字验证码
      const length = params.numericCodeLength || 6;
      return this.verificationCodeHelper.generateCode({
        length,
        numeric: true,
      });
    }

    // 生成指定字符数的 Base64URL 编码随机字符串
    const charCount = params.tokenLength || 32;
    return this.verificationCodeHelper.generateTokenByChars(charCount);
  }

  /**
   * 创建密码重置链接
   * 便捷方法：创建密码重置链接，默认 1 小时过期
   * @param params 创建参数
   * @returns 创建结果
   */
  async createPasswordResetLink(params: {
    targetAccountId: number;
    issuedByAccountId?: number;
    payload?: Record<string, unknown>;
    expiresInMinutes?: number;
    tokenLength?: number;
  }): Promise<CreateVerificationRecordUsecaseResult> {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (params.expiresInMinutes || 60));

    return this.execute({
      type: VerificationRecordType.PASSWORD_RESET,
      expiresAt,
      targetAccountId: params.targetAccountId,
      issuedByAccountId: params.issuedByAccountId,
      payload: params.payload,
      tokenLength: params.tokenLength || 64,
    });
  }
}
