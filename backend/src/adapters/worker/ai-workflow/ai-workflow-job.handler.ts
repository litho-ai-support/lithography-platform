import { Injectable } from '@nestjs/common';
import { ConsumeAiWorkflowJobUsecase } from '@src/usecases/ai-worker/consume-ai-workflow-job.usecase';
import {
  AI_WORKFLOW_JOB_NAME,
  type AiWorkflowFailedJob,
  type AiWorkflowJob,
  type AiWorkflowResult,
  mapAiWorkflowJobToCompleteInput,
  mapAiWorkflowJobToFailInput,
  mapAiWorkflowJobToProcessInput,
  mapMissingAiWorkflowJobToFailInput,
  mapUnknownAiWorkflowJobToFailInput,
} from './ai-workflow-job.mapper';

@Injectable()
export class AiWorkflowJobHandler {
  constructor(private readonly consumeAiWorkflowJobUsecase: ConsumeAiWorkflowJobUsecase) {}

  async process(input: { readonly job: AiWorkflowJob }): Promise<AiWorkflowResult> {
    return await this.consumeAiWorkflowJobUsecase.process(
      mapAiWorkflowJobToProcessInput({ job: input.job }),
    );
  }

  async onCompleted(input: { readonly job: AiWorkflowJob }): Promise<void> {
    await this.consumeAiWorkflowJobUsecase.complete(
      mapAiWorkflowJobToCompleteInput({ job: input.job }),
    );
  }

  async onFailed(input: {
    readonly job: AiWorkflowFailedJob | undefined;
    readonly error: Error;
  }): Promise<void> {
    if (!input.job) {
      await this.consumeAiWorkflowJobUsecase.fail(
        mapMissingAiWorkflowJobToFailInput({ error: input.error }),
      );
      return;
    }
    if (input.job.name === AI_WORKFLOW_JOB_NAME) {
      await this.consumeAiWorkflowJobUsecase.fail(
        mapAiWorkflowJobToFailInput({
          job: input.job as unknown as AiWorkflowJob,
          error: input.error,
        }),
      );
      return;
    }
    await this.consumeAiWorkflowJobUsecase.fail(
      mapUnknownAiWorkflowJobToFailInput({ job: input.job, error: input.error }),
    );
  }
}
