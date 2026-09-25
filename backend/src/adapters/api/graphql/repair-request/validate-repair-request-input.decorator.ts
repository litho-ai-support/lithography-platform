// src/adapters/api/graphql/repair-request/validate-repair-request-input.decorator.ts

import { ValidationError } from 'class-validator';

import { DomainError, REPAIR_REQUEST_ERROR } from '@core/common/errors/domain-error';
import { UsePipes, ValidationPipe } from '@nestjs/common';

import { formatValidationErrors } from '@adapters/api/graphql/common/validation.formatter';

/**
 * 维修申请模块局部输入校验入口。
 *
 * 为什么不直接复用通用 `ValidateInput`：通用入口的 exceptionFactory 抛
 * `BadRequestException`；生产环境的 `GqlAllExceptionsFilter` 会把 **所有** HttpException
 * 一律降级为 `INTERNAL_SERVER_ERROR` 并隐藏 message / errorCode，导致 DTO 校验失败
 * 被误分类为系统故障（用户可修复的输入问题 ≠ 服务端 5xx）。本入口改抛
 * `DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS)`，经全局过滤器
 * `mapDomainErrorToGqlCode` 的既有映射，在 production 仍稳定返回
 * `BAD_USER_INPUT` + 业务 `errorCode` + 可读 `errorMessage`。
 *
 * 校验语义与通用入口逐项保持一致：transform / whitelist / forbidNonWhitelisted /
 * 隐藏错误的 target 与 value / 聚合全部字段错误消息。
 *
 * 边界：`exceptionFactory` 只会收到 DTO 校验产生的 `ValidationError[]`；
 * 严禁在此做 catch-all 兜底，把数据库或程序错误伪装成参数错误。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ValidateRepairRequestInput = () =>
  UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: false,
      stopAtFirstError: false,
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors: ValidationError[]) => {
        const message = formatValidationErrors(errors);
        return new DomainError(REPAIR_REQUEST_ERROR.INVALID_PARAMS, message);
      },
    }),
  );
