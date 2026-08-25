import type {
  AiProviderClient,
  GenerateAiContentInput,
  GenerateAiContentResult,
} from '@core/ai/ai-provider.interface';
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'node:crypto';

interface QwenChatCompletionResponse {
  readonly id?: string;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?:
        string | ReadonlyArray<{ readonly type?: string; readonly text?: string }> | null;
    };
  }>;
}

@Injectable()
export class QwenGenerateProvider implements AiProviderClient {
  readonly name = 'qwen';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async generate(input: GenerateAiContentInput): Promise<GenerateAiContentResult> {
    const baseUrl = this.resolveBaseUrl();
    const apiKey = this.resolveApiKey();
    const timeoutMs = this.resolveTimeoutMs();
    const model = input.model.trim();
    const prompt = input.prompt.trim();

    const providerStartedAt = new Date();
    try {
      const response = await this.httpService.axiosRef.post<QwenChatCompletionResponse>(
        `${baseUrl}/chat/completions`,
        {
          model,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          timeout: timeoutMs,
          headers: {
            authorization: `Bearer ${apiKey}`,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': 'application/json',
          },
        },
      );
      const outputText = this.resolveOutputText(response.data);
      const providerJobId = this.resolveProviderJobId({
        responseId: response.data.id,
        model,
        prompt,
      });
      const providerFinishedAt = new Date();
      const usage = response.data.usage;
      return {
        accepted: true,
        outputText,
        provider: this.name,
        model,
        providerJobId,
        providerRequestId: response.data.id?.trim() || providerJobId,
        providerStatus: 'succeeded',
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
        costAmount: null,
        costCurrency: null,
        normalizedErrorCode: null,
        providerErrorCode: null,
        errorMessage: null,
        providerStartedAt,
        providerFinishedAt,
      };
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  private resolveBaseUrl(): string {
    const baseUrl = this.configService.get<string>('aiWorker.qwen.baseUrl', '');
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_CONFIG_MISSING, 'ai_provider_config_missing');
    }
    return normalizedBaseUrl;
  }

  private resolveApiKey(): string {
    const apiKey = this.configService.get<string>('aiWorker.qwen.apiKey', '');
    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new DomainError(THIRDPARTY_ERROR.PROVIDER_CONFIG_MISSING, 'ai_provider_config_missing');
    }
    return normalizedApiKey;
  }

  private resolveTimeoutMs(): number {
    const timeoutMs = this.configService.get<number>('aiWorker.qwen.generateTimeoutMs', 30000);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return 30000;
    }
    return timeoutMs;
  }

  private hasConfigValue(key: string): boolean {
    const value = this.configService.get<string>(key, '');
    return value.trim().length > 0;
  }

  private resolveOutputText(data: QwenChatCompletionResponse): string {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content
        .map((item: { readonly type?: string; readonly text?: string }) =>
          item.type === 'text' ? (item.text ?? '') : '',
        )
        .join('')
        .trim();
      if (text) {
        return text;
      }
    }
    return '[empty_output]';
  }

  private resolveProviderJobId(input: {
    readonly responseId?: string;
    readonly model: string;
    readonly prompt: string;
  }): string {
    if (input.responseId && input.responseId.trim().length > 0) {
      return `${this.name}:${input.responseId.trim()}`;
    }
    const digest = createHash('sha256').update(`${input.model}:${input.prompt}`).digest('hex');
    return `${this.name}:${digest.slice(0, 24)}`;
  }

  private mapProviderError(error: unknown): DomainError {
    if (error instanceof DomainError) {
      return error;
    }
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_timeout', {
          provider: this.name,
        });
      }
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_auth_failed', {
          provider: this.name,
          status,
        });
      }
      if (typeof status === 'number' && status >= 500) {
        return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_upstream_5xx', {
          provider: this.name,
          status,
        });
      }
      return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_request_failed', {
        provider: this.name,
        status,
      });
    }
    return new DomainError(THIRDPARTY_ERROR.PROVIDER_API_ERROR, 'ai_provider_unknown_error', {
      provider: this.name,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
