// src/adapters/api/graphql/ai/dto/queue-ai.result.ts
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class QueueAiResult {
  @Field(() => Boolean, { description: '是否已成功入队' })
  queued!: boolean;

  @Field(() => String, { description: '队列任务 ID' })
  jobId!: string;

  @Field(() => String, { description: '链路追踪 ID' })
  traceId!: string;
}
