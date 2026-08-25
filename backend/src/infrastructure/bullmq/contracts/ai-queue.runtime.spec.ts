/// <reference types="jest" />
// src/infrastructure/bullmq/contracts/ai-queue.runtime.spec.ts
import { BULLMQ_JOBS } from '../bullmq.constants';
import { AI_JOB_CONTRACT } from './ai-queue.runtime';

describe('AI queue runtime contract', () => {
  it('accepts workflow payload with only workflowId and traceId', () => {
    const validator = AI_JOB_CONTRACT[BULLMQ_JOBS.AI.WORKFLOW].payloadValidator;

    expect(
      validator({
        workflowId: 'workflow-1',
        traceId: 'trace-1',
      }),
    ).toBe(true);
  });

  it('rejects invalid workflow payload shapes', () => {
    const validator = AI_JOB_CONTRACT[BULLMQ_JOBS.AI.WORKFLOW].payloadValidator;
    const invalidPayloads: readonly unknown[] = [
      null,
      'workflow-1',
      {},
      { workflowId: 'workflow-1' },
      { traceId: 'trace-1' },
      { workflowId: ' ', traceId: 'trace-1' },
      { workflowId: 'workflow-1', traceId: ' ' },
      { workflowId: 'workflow-1', traceId: 'trace-1', model: 'gpt-4.1-mini' },
    ];

    for (const payload of invalidPayloads) {
      expect(validator(payload)).toBe(false);
    }
  });

  it('keeps generate and embed payload validators unchanged', () => {
    expect(
      AI_JOB_CONTRACT[BULLMQ_JOBS.AI.GENERATE].payloadValidator({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        prompt: 'hello',
        traceId: 'trace-generate',
      }),
    ).toBe(true);
    expect(
      AI_JOB_CONTRACT[BULLMQ_JOBS.AI.EMBED].payloadValidator({
        model: 'text-embedding-3-small',
        text: 'hello',
        traceId: 'trace-embed',
      }),
    ).toBe(true);
    expect(
      AI_JOB_CONTRACT[BULLMQ_JOBS.AI.EMBED].payloadValidator({
        provider: 'openai',
        model: 'text-embedding-3-small',
        text: 'hello',
        traceId: 'trace-embed',
      }),
    ).toBe(false);
  });
});
