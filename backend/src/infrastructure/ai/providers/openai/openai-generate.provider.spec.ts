// src/infrastructure/ai/providers/openai/openai-generate.provider.spec.ts
import { DomainError, THIRDPARTY_ERROR } from '@core/common/errors/domain-error';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { OpenAiGenerateProvider } from '@src/infrastructure/ai/providers/openai/openai-generate.provider';
import axios from 'axios';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

const createJsonServer = (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; baseUrl: string }> => {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
};

const closeServer = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

describe('OpenAiGenerateProvider', () => {
  const buildProvider = (input: {
    baseUrl: string;
    apiKey?: string;
    timeoutMs?: number;
  }): OpenAiGenerateProvider => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: number | string) => {
        if (key === 'aiWorker.openai.baseUrl') {
          return input.baseUrl;
        }
        if (key === 'aiWorker.openai.apiKey') {
          return input.apiKey ?? 'test-api-key';
        }
        if (key === 'aiWorker.openai.generateTimeoutMs') {
          return input.timeoutMs ?? 30000;
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;
    const httpService = new HttpService(axios.create());
    return new OpenAiGenerateProvider(httpService, configService);
  };

  it('成功映射 OpenAI 响应到 GenerateAiContentResult', async () => {
    const { server, baseUrl } = await createJsonServer((req, res) => {
      if (req.url === '/chat/completions' && req.method === 'POST') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'chatcmpl-test-id',
            choices: [{ message: { content: 'hello from openai' } }],
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    });

    try {
      const provider = buildProvider({ baseUrl });
      const result = await provider.generate({
        model: 'gpt-4o-mini',
        prompt: 'hello',
      });

      expect(result.accepted).toBe(true);
      expect(result.outputText).toBe('hello from openai');
      expect(result.providerJobId).toBe('openai:chatcmpl-test-id');
    } finally {
      await closeServer(server);
    }
  });

  it('超时错误映射为 ai_provider_timeout', async () => {
    const { server, baseUrl } = await createJsonServer((_req, res) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            id: 'chatcmpl-timeout',
            choices: [{ message: { content: 'late reply' } }],
          }),
        );
      }, 150);
    });

    try {
      const provider = buildProvider({ baseUrl, timeoutMs: 30 });
      await expect(
        provider.generate({
          model: 'gpt-4o-mini',
          prompt: 'timeout case',
        }),
      ).rejects.toMatchObject({
        code: THIRDPARTY_ERROR.PROVIDER_API_ERROR,
        message: 'ai_provider_timeout',
      });
    } finally {
      await closeServer(server);
    }
  });

  it('鉴权错误映射为 ai_provider_auth_failed', async () => {
    const { server, baseUrl } = await createJsonServer((_req, res) => {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: {
            message: 'invalid api key',
          },
        }),
      );
    });

    try {
      const provider = buildProvider({ baseUrl });
      try {
        await provider.generate({
          model: 'gpt-4o-mini',
          prompt: 'auth case',
        });
        throw new Error('should_throw');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe(THIRDPARTY_ERROR.PROVIDER_API_ERROR);
        expect((error as DomainError).message).toBe('ai_provider_auth_failed');
      }
    } finally {
      await closeServer(server);
    }
  });
});
