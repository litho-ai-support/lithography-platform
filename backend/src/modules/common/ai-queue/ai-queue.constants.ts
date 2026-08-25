import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';

export const AI_QUEUE_NAME = BULLMQ_QUEUES.AI;
export const AI_GENERATE_JOB_NAME = BULLMQ_JOBS.AI.GENERATE;
export const AI_EMBED_JOB_NAME = BULLMQ_JOBS.AI.EMBED;
