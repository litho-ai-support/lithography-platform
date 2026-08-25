// src/adapters/api/graphql/ai/ai.resolver.ts
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { JwtPayload } from '@app-types/jwt.types';
import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { qmWorkerEntry } from '@src/adapters/api/graphql/decorators/qm-worker-entry.decorator';
import { trimTextPure } from '@src/core/common/text/text.helper';
import { QueueAiUsecase } from '@src/usecases/ai-queue/queue-ai.usecase';
import { GetAsyncTaskRecordByQueueJobUsecase } from '@src/usecases/async-task-record/get-async-task-record-by-queue-job.usecase';
import type { GetAsyncTaskRecordByQueueJobResult } from '@src/usecases/async-task-record/get-async-task-record-by-queue-job.types';
import { ListAsyncTaskRecordsByBizTargetUsecase } from '@src/usecases/async-task-record/list-async-task-records-by-biz-target.usecase';
import { ListAsyncTaskRecordsByTraceIdUsecase } from '@src/usecases/async-task-record/list-async-task-records-by-trace-id.usecase';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { QueueAiEmbedInput } from './dto/queue-ai-embed.input';
import { QueueAiGenerateInput } from './dto/queue-ai-generate.input';
import { QueueAiResult } from './dto/queue-ai.result';

const AI_DEBUG_BIZ_TYPES = ['ai_generation', 'ai_embedding', 'ai_worker', 'ai_workflow'] as const;
const AI_DEBUG_QUEUE_NAMES = ['ai-execution', 'ai-workflow'] as const;

@ObjectType()
class AsyncTaskRecordDebugType {
  @Field(() => Int)
  id!: number;

  @Field(() => String)
  queueName!: string;

  @Field(() => String)
  jobName!: string;

  @Field(() => String)
  jobId!: string;

  @Field(() => String)
  traceId!: string;

  @Field(() => Int, { nullable: true })
  actorAccountId!: number | null;

  @Field(() => String, { nullable: true })
  actorActiveRole!: string | null;

  @Field(() => String)
  bizType!: string;

  @Field(() => String)
  bizKey!: string;

  @Field(() => String, { nullable: true })
  bizSubKey!: string | null;

  @Field(() => String)
  source!: string;

  @Field(() => String, { nullable: true })
  reason!: string | null;

  @Field(() => Date, { nullable: true })
  occurredAt!: Date | null;

  @Field(() => String, { nullable: true })
  dedupKey!: string | null;

  @Field(() => String)
  status!: string;

  @Field(() => Int)
  attemptCount!: number;

  @Field(() => Int, { nullable: true })
  maxAttempts!: number | null;

  @Field(() => Date)
  enqueuedAt!: Date;

  @Field(() => Date, { nullable: true })
  startedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  finishedAt!: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
class AsyncTaskRecordDebugListResult {
  @Field(() => [AsyncTaskRecordDebugType])
  items!: AsyncTaskRecordDebugType[];
}

@InputType()
class DebugAsyncTaskRecordsByTraceIdInput {
  @Field(() => String)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString()
  @IsNotEmpty()
  traceId!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@InputType()
class DebugAsyncTaskRecordsByBizTargetInput {
  @Field(() => String)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString()
  @IsNotEmpty()
  @IsIn([...AI_DEBUG_BIZ_TYPES])
  bizType!: string;

  @Field(() => String)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString()
  @IsNotEmpty()
  bizKey!: string;

  @Field(() => String, { nullable: true })
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsOptional()
  @IsString()
  bizSubKey?: string | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@InputType()
class DebugAsyncTaskRecordByQueueJobInput {
  @Field(() => String)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString()
  @IsNotEmpty()
  @IsIn([...AI_DEBUG_QUEUE_NAMES])
  queueName!: string;

  @Field(() => String)
  @Transform(({ value }: TransformFnParams) => trimTextPure(value))
  @IsString()
  @IsNotEmpty()
  jobId!: string;
}

@Resolver()
export class AiResolver {
  constructor(
    private readonly queueAiUsecase: QueueAiUsecase,
    private readonly listAsyncTaskRecordsByTraceIdUsecase: ListAsyncTaskRecordsByTraceIdUsecase,
    private readonly listAsyncTaskRecordsByBizTargetUsecase: ListAsyncTaskRecordsByBizTargetUsecase,
    private readonly getAsyncTaskRecordByQueueJobUsecase: GetAsyncTaskRecordByQueueJobUsecase,
  ) {}

  @qmWorkerEntry('AI_STRICT')
  @Mutation(() => QueueAiResult, { description: '将 AI 生成请求加入队列' })
  @ValidateInput()
  async queueAiGenerate(
    @Args('input') input: QueueAiGenerateInput,
    @currentUser() user: JwtPayload,
  ): Promise<QueueAiResult> {
    const result = await this.queueAiUsecase.executeGenerate({
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      metadata: input.metadata,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
      actorAccountId: user.sub,
      actorActiveRole: this.resolveActorActiveRole(user),
    });
    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }

  @qmWorkerEntry('AI_STRICT')
  @Mutation(() => QueueAiResult, { description: '将 AI 向量化请求加入队列' })
  @ValidateInput()
  async queueAiEmbed(
    @Args('input') input: QueueAiEmbedInput,
    @currentUser() user: JwtPayload,
  ): Promise<QueueAiResult> {
    const result = await this.queueAiUsecase.executeEmbed({
      model: input.model,
      text: input.text,
      metadata: input.metadata,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
      actorAccountId: user.sub,
      actorActiveRole: this.resolveActorActiveRole(user),
    });
    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }

  @qmWorkerEntry('AI_STRICT')
  @Query(() => AsyncTaskRecordDebugListResult, {
    description: '内部调试审计：按 traceId 查询异步任务链路',
  })
  @ValidateInput()
  async debugAsyncTaskRecordsByTraceId(
    @Args('input') input: DebugAsyncTaskRecordsByTraceIdInput,
  ): Promise<AsyncTaskRecordDebugListResult> {
    const result = await this.listAsyncTaskRecordsByTraceIdUsecase.execute({
      traceId: input.traceId,
      bizTypes: [...AI_DEBUG_BIZ_TYPES],
      limit: input.limit,
    });
    return {
      items: result.items.map((item) => this.toDebugType(item)),
    };
  }

  @qmWorkerEntry('AI_STRICT')
  @Query(() => AsyncTaskRecordDebugListResult, {
    description: '内部调试审计：按 bizType 与 bizKey 查询异步任务记录',
  })
  @ValidateInput()
  async debugAsyncTaskRecordsByBizTarget(
    @Args('input') input: DebugAsyncTaskRecordsByBizTargetInput,
  ): Promise<AsyncTaskRecordDebugListResult> {
    const result = await this.listAsyncTaskRecordsByBizTargetUsecase.execute({
      bizType: input.bizType,
      bizKey: input.bizKey,
      bizSubKey: input.bizSubKey,
      limit: input.limit,
    });
    return {
      items: result.items.map((item) => this.toDebugType(item)),
    };
  }

  @qmWorkerEntry('AI_STRICT')
  @Query(() => AsyncTaskRecordDebugType, {
    nullable: true,
    description: '内部调试审计：按 queueName 与 jobId 查询单任务记录',
  })
  @ValidateInput()
  async debugAsyncTaskRecordByQueueJob(
    @Args('input') input: DebugAsyncTaskRecordByQueueJobInput,
  ): Promise<AsyncTaskRecordDebugType | null> {
    const record = await this.getAsyncTaskRecordByQueueJobUsecase.execute({
      queueName: input.queueName,
      jobId: input.jobId,
    });
    if (!record) {
      return null;
    }
    return this.toDebugType(record);
  }

  private toDebugType(
    input: NonNullable<GetAsyncTaskRecordByQueueJobResult>,
  ): AsyncTaskRecordDebugType {
    return {
      id: input.id,
      queueName: input.queueName,
      jobName: input.jobName,
      jobId: input.jobId,
      traceId: input.traceId,
      actorAccountId: input.actorAccountId,
      actorActiveRole: input.actorActiveRole,
      bizType: input.bizType,
      bizKey: input.bizKey,
      bizSubKey: input.bizSubKey,
      source: input.source,
      reason: input.reason,
      occurredAt: input.occurredAt,
      dedupKey: input.dedupKey,
      status: input.status,
      attemptCount: input.attemptCount,
      maxAttempts: input.maxAttempts,
      enqueuedAt: input.enqueuedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  private resolveActorActiveRole(user: JwtPayload): string | null {
    if (!user.activeRole) {
      return null;
    }
    return user.activeRole;
  }
}
