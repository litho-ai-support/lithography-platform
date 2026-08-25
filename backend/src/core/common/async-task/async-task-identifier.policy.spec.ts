import {
  resolveAsyncTaskBizKey,
  resolveEnqueueFailureIdentifiers,
} from './async-task-identifier.policy';

describe('async task identifier policy', () => {
  it('AI 任务应固定使用 traceId 作为 bizKey', () => {
    expect(
      resolveAsyncTaskBizKey({
        domain: 'ai_generation',
        traceId: ' trace-1 ',
        jobId: 'job-1',
        dedupKey: 'dedup-1',
      }),
    ).toBe('trace-1');

    expect(
      resolveAsyncTaskBizKey({
        domain: 'ai_embedding',
        traceId: 'trace-2',
        jobId: 'job-2',
      }),
    ).toBe('trace-2');
  });

  it('email 任务应优先使用 jobId，其次 dedupKey，最后 traceId', () => {
    expect(
      resolveAsyncTaskBizKey({
        domain: 'email',
        traceId: 'trace-email',
        jobId: ' job-email ',
        dedupKey: 'dedup-email',
      }),
    ).toBe('job-email');

    expect(
      resolveAsyncTaskBizKey({
        domain: 'email',
        traceId: 'trace-email',
        dedupKey: ' dedup-email ',
      }),
    ).toBe('dedup-email');

    expect(
      resolveAsyncTaskBizKey({
        domain: 'email',
        traceId: ' trace-email ',
      }),
    ).toBe('trace-email');
  });

  it('入队失败缺少 traceId 时应生成稳定兜底 traceId', () => {
    const occurredAt = new Date('2026-05-22T01:02:03.004Z');

    expect(
      resolveEnqueueFailureIdentifiers({
        domain: 'ai_generation',
        occurredAt,
        traceIdPrefix: 'enqueue-failed:',
      }),
    ).toEqual({
      traceId: `enqueue-failed:${occurredAt.getTime()}`,
      failedJobId: undefined,
      bizKey: `enqueue-failed:${occurredAt.getTime()}`,
    });
  });

  it('email 入队失败带 dedupKey 时应使用 dedupKey 作为 failedJobId 和 bizKey', () => {
    const occurredAt = new Date('2026-05-22T01:02:03.004Z');

    expect(
      resolveEnqueueFailureIdentifiers({
        domain: 'email',
        traceId: ' trace-email ',
        dedupKey: ' dedup-email ',
        occurredAt,
        traceIdPrefix: 'unused:',
      }),
    ).toEqual({
      traceId: 'trace-email',
      failedJobId: 'dedup-email',
      bizKey: 'dedup-email',
    });
  });
});
