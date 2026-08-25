// src/infrastructure/middleware/format-response.middleware.ts

import { ApiResponse, ShowType } from '@app-types/response.types';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import { PinoLogger } from 'nestjs-pino';

/**
 * HTTP 响应格式化中间件
 * 根据请求头条件性地格式化响应为 Ant Design Pro 约定格式
 * 拦截 res.json 方法，只对 JSON 响应进行格式化
 */
@Injectable()
export class FormatResponseMiddleware implements NestMiddleware {
  private readonly bypassPaths = new Set<string>(['/health', '/health/readiness']);

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(FormatResponseMiddleware.name);
  }
  /**
   * 中间件处理函数
   */
  use(req: Request, res: Response, next: NextFunction): void {
    try {
      // 拦截原始的 res.json 方法
      const originalJson = res.json.bind(res);
      res.json = (body: unknown): Response => {
        try {
          if (this.shouldBypassFormatting(req)) {
            return originalJson(body);
          }
          const formattedBody = this.formatToAntdProResponse(req, body);
          return originalJson(formattedBody);
        } catch (error) {
          this.logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              path: req.url,
              method: req.method,
            },
            '响应格式化过程中发生错误',
          );
          return originalJson(body);
        }
      };

      next();
    } catch (error) {
      this.logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        '中间件处理过程中发生错误',
      );
      next();
    }
  }

  /**
   * 格式化响应为 Ant Design Pro 格式
   */
  private formatToAntdProResponse(req: Request, body: unknown): ApiResponse {
    const requestId = this.generateRequestId();
    const host = req.headers.host || 'unknown';

    // 检查是否是错误响应
    if (this.isGraphQLErrorResponse(body)) {
      return this.wrapError(body.errors[0], requestId, host);
    }

    // 格式化成功响应
    return {
      success: true,
      data: body,
      requestId,
      host,
    };
  }

  /**
   * 检查是否是错误响应
   */
  private isGraphQLErrorResponse(body: unknown): body is { errors: GraphQLError[] } {
    return (
      typeof body === 'object' &&
      body !== null &&
      Array.isArray((body as Record<string, unknown>).errors)
    );
  }

  /**
   * 按照 ApiResponse<T> 和 ShowType 生成 error envelope
   */
  private wrapError(error: GraphQLError, requestId: string, host: string): ApiResponse {
    const { errorCode, errorMessage, showType } = this.parseErrorMessage(error.message);
    return {
      success: false,
      data: null,
      errorCode,
      errorMessage,
      showType,
      requestId,
      host,
    };
  }

  /**
   * 解析错误信息
   * 返回类型显式为 ApiResponse 的相关字段
   */
  private parseErrorMessage(message: string): {
    errorCode: string;
    errorMessage: string;
    showType: ShowType;
  } {
    const errorParts = message.split(':');
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = message;
    let showType = ShowType.ERROR_MESSAGE;

    // 错误信息被分隔成3段或以上，比如 "401:未登录:9"
    if (errorParts.length >= 3) {
      errorCode = errorParts[0].trim();
      errorMessage = errorParts[1].trim();
      const showTypeValue = parseInt(errorParts[2].trim(), 10);
      showType = Number.isNaN(showTypeValue) ? ShowType.ERROR_MESSAGE : showTypeValue;
    } else if (errorParts.length === 2) {
      // 错误信息被分隔成2段，比如 "401:未登录"
      errorCode = errorParts[0].trim();
      errorMessage = errorParts[1].trim();
    }

    return { errorCode, errorMessage, showType };
  }

  /**
   * 生成追踪 ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private shouldBypassFormatting(req: Request): boolean {
    return this.bypassPaths.has(req.path);
  }
}
