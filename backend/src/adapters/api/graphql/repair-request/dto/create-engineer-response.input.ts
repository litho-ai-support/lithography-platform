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
 * - 回复正文的容量上限已确认为 MySQL TEXT 的 65,535 UTF-8 字节，由 usecase
 *   通过 Buffer.byteLength 做真实字节校验（assertEngineerResponseTextCapacity）；
 *   本层故意不使用 @MaxLength：class-validator 的 MaxLength 计量的是 UTF-16 码元数
 *   （string.length），不是 UTF-8 字节数，用它冒充字节容量会放行超限的中文/emoji 正文，
 *   因此本层只保留 @IsString 结构校验，最终容量保护由 usecase 单一负责
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
