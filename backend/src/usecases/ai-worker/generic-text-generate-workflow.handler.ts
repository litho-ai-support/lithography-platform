import { AI_PROVIDERS, type AiProvider } from '@app-types/common/ai-provider.types';
import { Injectable } from '@nestjs/common';
import {
  normalizeEnumValue,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@src/core/common/input-normalize/input-normalize.policy';
import type {
  AiWorkflowContextView,
  AiWorkflowJsonPayload,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import { AiWorkflowHandlerProvider } from './ai-workflow-handler.registry';
import type {
  AiWorkflowHandler,
  AiWorkflowHandlerProcessInput,
  AiWorkflowHandlerProcessResult,
} from './ai-workflow-handler.types';
import { AiWorkflowNonRetryableError } from './ai-workflow-worker-errors';

export const GENERIC_TEXT_GENERATE_WORKFLOW_TYPE = 'generic_text_generate';
export const GENERIC_TEXT_GENERATE_PROMPT_MAX_CHARS = 12000;

interface GenericTextGenerateWorkflowInput {
  readonly userPrompt: string;
  readonly systemPrompt?: string;
  readonly context?: string;
  readonly provider?: AiProvider;
  readonly model: string;
}

interface GenericTextGenerateExecutionInput {
  readonly provider?: AiProvider;
  readonly model: string;
  readonly prompt: string;
}

@Injectable()
@AiWorkflowHandlerProvider()
export class GenericTextGenerateWorkflowHandler implements AiWorkflowHandler {
  readonly workflowType = GENERIC_TEXT_GENERATE_WORKFLOW_TYPE;

  constructor(private readonly aiWorkerService: AiWorkerService) {}

  async handle(input: AiWorkflowHandlerProcessInput): Promise<AiWorkflowHandlerProcessResult> {
    const payload = normalizeGenericTextGenerateInput(input.inputPayload);
    const executionInput = resolveExecutionInput({
      context: input.context,
      payload,
    });
    const providerStartedAtFallback = new Date();
    const result = await this.aiWorkerService.generate({
      provider: executionInput.provider,
      model: executionInput.model,
      prompt: executionInput.prompt,
      metadata: {
        workflowId: input.context.workflowId,
        workflowType: input.context.workflowType,
        traceId: input.context.traceId,
      },
    });

    return {
      outputPayload: {
        outputText: result.outputText,
        provider: result.provider,
        model: result.model,
        providerJobId: result.providerJobId,
        providerRequestId: result.providerRequestId ?? null,
      },
      providerCall: {
        taskType: 'generate',
        result,
        providerStartedAtFallback,
      },
    };
  }
}

function normalizeGenericTextGenerateInput(
  payload: AiWorkflowJsonPayload,
): GenericTextGenerateWorkflowInput {
  try {
    const objectPayload = resolveObjectPayload(payload);
    return {
      userPrompt: normalizeRequiredText(objectPayload.userPrompt, { fieldName: 'userPrompt' }),
      systemPrompt:
        normalizeOptionalText(objectPayload.systemPrompt, 'to_undefined', {
          fieldName: 'systemPrompt',
        }) ?? undefined,
      context:
        normalizeOptionalText(objectPayload.context, 'to_undefined', { fieldName: 'context' }) ??
        undefined,
      provider: normalizeOptionalProvider(objectPayload.provider),
      model: normalizeRequiredText(objectPayload.model, { fieldName: 'model' }),
    };
  } catch {
    throw createInvalidInputError();
  }
}

function resolveExecutionInput(input: {
  readonly context: AiWorkflowContextView;
  readonly payload: GenericTextGenerateWorkflowInput;
}): GenericTextGenerateExecutionInput {
  try {
    const contextProvider = normalizeOptionalProvider(input.context.provider);
    const contextModel =
      normalizeOptionalText(input.context.model, 'to_undefined', { fieldName: 'context.model' }) ??
      undefined;
    if (contextProvider && input.payload.provider && contextProvider !== input.payload.provider) {
      throw new Error('workflow_provider_snapshot_mismatch');
    }
    if (contextModel && contextModel !== input.payload.model) {
      throw new Error('workflow_model_snapshot_mismatch');
    }
    const prompt = buildGeneratePrompt(input.payload);
    if (prompt.length > GENERIC_TEXT_GENERATE_PROMPT_MAX_CHARS) {
      throw new Error('workflow_prompt_too_long');
    }
    return {
      provider: contextProvider ?? input.payload.provider,
      model: contextModel ?? input.payload.model,
      prompt,
    };
  } catch {
    throw createInvalidInputError();
  }
}

function resolveObjectPayload(payload: AiWorkflowJsonPayload): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('workflow_input_payload_must_be_object');
  }
  return payload as Record<string, unknown>;
}

function normalizeOptionalProvider(value: unknown): AiProvider | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return normalizeEnumValue(value, AI_PROVIDERS, {
    fieldName: 'provider',
    caseInsensitive: true,
  });
}

function buildGeneratePrompt(payload: GenericTextGenerateWorkflowInput): string {
  const sections: string[] = [];
  if (payload.systemPrompt) {
    sections.push(`System:\n${payload.systemPrompt}`);
  }
  if (payload.context) {
    sections.push(`Context:\n${payload.context}`);
  }
  sections.push(`User:\n${payload.userPrompt}`);
  return sections.join('\n\n');
}

function createInvalidInputError(): AiWorkflowNonRetryableError {
  return new AiWorkflowNonRetryableError(
    'workflow_input_payload_invalid',
    'WORKFLOW_INPUT_PAYLOAD_INVALID',
  );
}
