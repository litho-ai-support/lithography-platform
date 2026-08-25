// src/adapters/api/graphql/email/dto/queue-email.result.ts
import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class QueueEmailResult {
  @Field(() => Boolean, { description: '是否已成功入队' })
  queued!: boolean;

  @Field(() => String, { description: '队列任务 ID' })
  jobId!: string;

  @Field(() => String, { description: '链路追踪 ID' })
  traceId!: string;
}
