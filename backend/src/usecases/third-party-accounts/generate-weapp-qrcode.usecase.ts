// 文件位置：src/usecases/third-party-accounts/generate-weapp-qrcode.usecase.ts
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { ThirdPartyAuthService } from '@modules/third-party-auth/third-party-auth.service';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  GenerateWeappQrcodeParams,
  GenerateWeappQrcodeResult,
} from './generate-weapp-qrcode.types';

/**
 * 生成微信小程序二维码 Usecase
 * 负责编排：通过 appid + secret 换取 access_token，然后调用微信 "getwxacodeunlimit" 生成二维码
 */
@Injectable()
export class GenerateWeappQrcodeUsecase {
  constructor(
    private readonly thirdPartyAuthService: ThirdPartyAuthService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerateWeappQrcodeUsecase.name);
  }

  /**
   * 执行生成二维码流程
   * @param params 对象参数
   * @returns 二维码图片数据
   */
  async execute(params: GenerateWeappQrcodeParams): Promise<GenerateWeappQrcodeResult> {
    this.logger.info('开始生成微信小程序二维码', {
      params: { ...params, scene: '[REDACTED]' },
    });

    try {
      this.validateParams(params);

      const normalizedScene = this.normalizeScene(params.scene);

      const { buffer, contentType } = await this.thirdPartyAuthService.generateWeappQrcode({
        audience: params.audience,
        scene: normalizedScene,
        page: params.page,
        width: params.width,
        checkPath: params.checkPath,
        envVersion: params.envVersion,
        isHyaline: params.isHyaline,
      });

      const encodeBase64 = params.encodeBase64 !== false;
      const result: GenerateWeappQrcodeResult = { contentType };
      if (encodeBase64) {
        result.imageBase64 = buffer.toString('base64');
      } else {
        result.imageBuffer = buffer;
      }

      this.logger.info('生成微信小程序二维码成功');
      return result;
    } catch (error) {
      this.logger.error('生成微信小程序二维码失败', {
        error,
        params: { ...params, scene: '[REDACTED]' },
      });

      if (error instanceof DomainError) {
        throw error;
      }
      throw new DomainError(THIRDPARTY_ERROR.UNKNOWN_ERROR, '生成二维码时发生未知错误');
    }
  }

  /**
   * 验证输入参数
   * @param params 原始参数
   */
  private validateParams(params: GenerateWeappQrcodeParams): void {
    if (!params.audience) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'audience 不能为空');
    }
    if (!params.scene || typeof params.scene !== 'string') {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'scene 必须为非空字符串');
    }
    if (params.scene.length > 32) {
      throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'scene 字符串长度不能超过 32');
    }
    if (typeof params.width === 'number') {
      const w = params.width;
      if (!Number.isFinite(w) || w < 280 || w > 1280) {
        throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'width 必须在 280–1280 范围内');
      }
    }
    if (params.envVersion) {
      const allowed: Array<'develop' | 'trial' | 'release'> = ['develop', 'trial', 'release'];
      if (!allowed.includes(params.envVersion)) {
        throw new DomainError(THIRDPARTY_ERROR.INVALID_PARAMS, 'envVersion 值非法');
      }
    }
  }

  /**
   * 规范化场景值
   * - 保留原始字符串，仅做长度保护（最多 32）
   */
  private normalizeScene(scene: string): string {
    // 长度安全剪裁：防止超过 32
    if (scene.length > 32) return scene.slice(0, 32);
    return scene;
  }
}
