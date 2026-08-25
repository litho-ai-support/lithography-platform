// src/infrastructure/bullmq/contracts/ai-queue.runtime.ts
import { AI_PROVIDERS, type AiProvider } from '@app-types/common/ai-provider.types';

import { BULLMQ_JOBS } from '../bullmq.constants';
import {
  isNonEmptyString,
  isOptionalNonEmptyString,
  isOptionalRecordOfString,
  isRecord,
} from './shared-payload-validators';

export interface AiGeneratePayload {
  readonly provider?: AiProvider;
  readonly model: string;
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly traceId?: string;
}

export interface AiGenerateResult {
  readonly accepted: boolean;
  readonly outputText: string;
  readonly provider: string;
  readonly model: string;
  readonly providerJobId: string;
  readonly providerRequestId?: string | null;
  readonly providerStatus?: 'succeeded' | 'failed';
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
}

export interface AiEmbedPayload {
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly traceId?: string;
}

export interface AiEmbedResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly provider: string;
  readonly model: string;
  readonly providerJobId: string;
  readonly providerRequestId?: string | null;
  readonly providerStatus?: 'succeeded' | 'failed';
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
}

export interface AiWorkflowPayload {
  readonly workflowId: string;
  readonly traceId: string;
}

export interface AiWorkflowResult {
  readonly accepted: boolean;
  readonly workflowId: string;
  readonly traceId: string;
}

const isAiProvider = (value: string): value is AiProvider => {
  return AI_PROVIDERS.some((provider) => provider === value);
};

const isOptionalAiProvider = (value: unknown): value is AiProvider | undefined => {
  if (!isOptionalNonEmptyString(value)) {
    return false;
  }
  if (value === undefined) {
    return true;
  }
  return isAiProvider(value);
};

const isAiGeneratePayload = (payload: unknown): payload is AiGeneratePayload => {
  if (!isRecord(payload)) return false;
  return (
    isOptionalAiProvider(payload.provider) &&
    isNonEmptyString(payload.model) &&
    isNonEmptyString(payload.prompt) &&
    isOptionalRecordOfString(payload.metadata) &&
    isOptionalNonEmptyString(payload.traceId)
  );
};

const isAiEmbedPayload = (payload: unknown): payload is AiEmbedPayload => {
  if (!isRecord(payload)) return false;
  return (
    payload.provider === undefined &&
    isNonEmptyString(payload.model) &&
    isNonEmptyString(payload.text) &&
    isOptionalRecordOfString(payload.metadata) &&
    isOptionalNonEmptyString(payload.traceId)
  );
};

const isAiWorkflowPayload = (payload: unknown): payload is AiWorkflowPayload => {
  if (!isRecord(payload)) return false;
  const keys = Object.keys(payload);
  return (
    keys.length === 2 &&
    keys.every((key) => key === 'workflowId' || key === 'traceId') &&
    isNonEmptyString(payload.workflowId) &&
    isNonEmptyString(payload.traceId)
  );
};

export const AI_JOB_CONTRACT = {
  [BULLMQ_JOBS.AI.GENERATE]: {
    payload: {} as AiGeneratePayload,
    result: {} as AiGenerateResult,
    payloadValidator: isAiGeneratePayload,
  },
  [BULLMQ_JOBS.AI.EMBED]: {
    payload: {} as AiEmbedPayload,
    result: {} as AiEmbedResult,
    payloadValidator: isAiEmbedPayload,
  },
  [BULLMQ_JOBS.AI.WORKFLOW]: {
    payload: {} as AiWorkflowPayload,
    result: {} as AiWorkflowResult,
    payloadValidator: isAiWorkflowPayload,
  },
} as const;
