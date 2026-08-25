import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { LocalMockAiProvider } from './providers/local/local-mock-ai.provider';
import { OpenAiGenerateProvider } from './providers/openai/openai-generate.provider';
import { QwenGenerateProvider } from './providers/qwen/qwen-generate.provider';

@Module({
  imports: [HttpModule],
  providers: [LocalMockAiProvider, OpenAiGenerateProvider, QwenGenerateProvider],
  exports: [LocalMockAiProvider, OpenAiGenerateProvider, QwenGenerateProvider],
})
export class AiInfrastructureModule {}
