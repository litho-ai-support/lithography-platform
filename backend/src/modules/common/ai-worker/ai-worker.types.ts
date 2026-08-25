// src/modules/common/ai-worker/ai-worker.types.ts
import type {
  EmbedAiContentInput as CoreEmbedAiContentInput,
  EmbedAiContentResult as CoreEmbedAiContentResult,
  GenerateAiContentInput as CoreGenerateAiContentInput,
  GenerateAiContentResult as CoreGenerateAiContentResult,
} from '@core/ai/ai-provider.interface';

export type GenerateAiContentInput = CoreGenerateAiContentInput;
export type GenerateAiContentResult = CoreGenerateAiContentResult;
export type EmbedAiContentInput = CoreEmbedAiContentInput;
export type EmbedAiContentResult = CoreEmbedAiContentResult;
