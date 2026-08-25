// src/adapters/api/graphql/email/email.resolver.ts
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { qmWorkerEntry } from '@src/adapters/api/graphql/decorators/qm-worker-entry.decorator';
import { QueueEmailUsecase } from '@src/usecases/email-queue/queue-email.usecase';
import { QueueEmailInput } from './dto/queue-email.input';
import { QueueEmailResult } from './dto/queue-email.result';

@Resolver()
export class EmailResolver {
  constructor(private readonly queueEmailUsecase: QueueEmailUsecase) {}

  @qmWorkerEntry('EMAIL_RELAXED')
  @Mutation(() => QueueEmailResult, { description: '将邮件投递请求加入队列' })
  @ValidateInput()
  async queueEmail(@Args('input') input: QueueEmailInput): Promise<QueueEmailResult> {
    const result = await this.queueEmailUsecase.execute({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      templateId: input.templateId,
      meta: input.meta,
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });

    return {
      queued: true,
      jobId: result.jobId,
      traceId: result.traceId,
    };
  }
}
