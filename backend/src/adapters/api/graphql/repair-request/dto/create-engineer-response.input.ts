// src/adapters/api/graphql/repair-request/dto/create-engineer-response.input.ts

import { EngineerResolutionStatus } from '@app-types/models/repair-request.types';
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';

/**
 * 工程师追加处理回复输入参数
 *
 * 仅做结构校验（拦脏数据）：
 * - 回复正文的空白语义由 usecase 通过 normalizeRequiredText 收敛，本层不做 trim；
 * - resolutionStatus 的三层职责不同，不得相互取代：
 *   GraphQL 运行时负责协议值解析，本层 @IsEnum 负责 Adapter 入口结构校验
 *   并向 @ValidateInput 的 ValidationPipe（whitelist + forbidNonWhitelisted）
 *   声明该属性属于白名单，usecase 的 normalizeEnumValue 继续负责
 *   绕过 GraphQL 入口时的业务边界失败关闭；
 * - 本层不复制也不重新定义枚举，@IsEnum 直接复用 @app-types 的正式领域 enum，
 *   该 enum 已在 src/adapters/api/graphql/schema/enum.registry.ts 集中注册
 *   （单一运行时真源）；本层不推断默认状态；
 * - engineerAccountId 仅取自可信 Session、customerAccountId 仅从目标申请派生，
 *   输入中不存在任何归属账号 ID；
 * - 回复正文不设装配层 MaxLength 防御：create-repair-request.input.ts 的防御值
 *   是已确认业务上限的镜像，本需求尚未确认业务上限，无值可镜像，避免散写任意数值；
 *   负责人确认上限后须同步更新本层与 usecase 校验
 */
@InputType({ description: '工程师追加处理回复输入参数' })
export class CreateEngineerResponseInput {
  @Field(() => Int, { description: '维修申请 ID' })
  @IsInt({ message: '维修申请 ID 必须是整数' })
  @Min(1, { message: '维修申请 ID 必须大于 0' })
  requestId!: number;

  @Field(() => String, { description: '处理回复正文' })
  @IsString({ message: '回复正文必须是字符串' })
  responseText!: string;

  @Field(() => EngineerResolutionStatus, { description: '本次回复的处理状态' })
  @IsEnum(EngineerResolutionStatus, { message: '处理状态无效' })
  resolutionStatus!: EngineerResolutionStatus;
}
