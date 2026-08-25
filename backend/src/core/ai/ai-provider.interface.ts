export interface GenerateAiContentInput {
  readonly provider?: string;
  readonly model: string;
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface GenerateAiContentResult {
  readonly accepted: boolean;
  readonly outputText: string;
  readonly provider: string;
  readonly model: string;
  readonly providerJobId: string;
  readonly providerRequestId?: string | null;
  readonly providerStatus?: 'succeeded' | 'failed';
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
  readonly providerLatencyMs?: number | null;
}

export interface EmbedAiContentInput {
  readonly model: string;
  readonly text: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface EmbedAiContentResult {
  readonly accepted: boolean;
  readonly vector: ReadonlyArray<number>;
  readonly provider: string;
  readonly model: string;
  readonly providerJobId: string;
  readonly providerRequestId?: string | null;
  readonly providerStatus?: 'succeeded' | 'failed';
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costAmount?: string | null;
  readonly costCurrency?: string | null;
  readonly normalizedErrorCode?: string | null;
  readonly providerErrorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly providerStartedAt?: Date | null;
  readonly providerFinishedAt?: Date | null;
  readonly providerLatencyMs?: number | null;
}

export interface AiProviderClient {
  readonly name: string;
  generate?(input: GenerateAiContentInput): Promise<GenerateAiContentResult>;
  embed?(input: EmbedAiContentInput): Promise<EmbedAiContentResult>;
}
