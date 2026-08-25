// src/types/common/ai-provider.types.ts

export const AI_PROVIDERS = ['openai', 'qwen'] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];
