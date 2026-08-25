import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { normalizeRequiredText } from '@src/core/common/input-normalize/input-normalize.policy';
import { AiWorkflowNonRetryableError } from './ai-workflow-worker-errors';
import type { AiWorkflowHandler } from './ai-workflow-handler.types';

const AI_WORKFLOW_HANDLER_DISCOVERABLE = DiscoveryService.createDecorator();
export const AI_WORKFLOW_HANDLER_METADATA_KEY = AI_WORKFLOW_HANDLER_DISCOVERABLE.KEY;

// eslint-disable-next-line @typescript-eslint/naming-convention
export function AiWorkflowHandlerProvider(): ClassDecorator {
  return AI_WORKFLOW_HANDLER_DISCOVERABLE();
}

@Injectable()
export class AiWorkflowHandlerRegistry {
  private handlers: ReadonlyMap<string, AiWorkflowHandler> | null = null;

  constructor(private readonly discoveryService: DiscoveryService) {}

  getHandler(workflowType: string): AiWorkflowHandler {
    const normalizedWorkflowType = normalizeRequiredWorkflowType(workflowType);
    const handler = this.resolveHandlers().get(normalizedWorkflowType);
    if (!handler) {
      throw new AiWorkflowNonRetryableError(
        'workflow_handler_not_found',
        'WORKFLOW_HANDLER_NOT_FOUND',
      );
    }
    return handler;
  }

  private resolveHandlers(): ReadonlyMap<string, AiWorkflowHandler> {
    if (!this.handlers) {
      const wrappers = this.discoveryService.getProviders({
        metadataKey: AI_WORKFLOW_HANDLER_METADATA_KEY,
      });
      const handlers: AiWorkflowHandler[] = [];
      for (const wrapper of wrappers) {
        if (isAiWorkflowHandler(wrapper.instance)) {
          handlers.push(wrapper.instance);
        }
      }
      this.handlers = buildHandlerMap(handlers);
    }
    return this.handlers;
  }
}

function buildHandlerMap(
  handlers: readonly AiWorkflowHandler[],
): ReadonlyMap<string, AiWorkflowHandler> {
  const map = new Map<string, AiWorkflowHandler>();
  for (const handler of handlers) {
    const workflowType = normalizeRequiredWorkflowType(handler.workflowType);
    if (map.has(workflowType)) {
      throw new Error(`duplicate_ai_workflow_handler:${workflowType}`);
    }
    map.set(workflowType, handler);
  }
  return map;
}

function normalizeRequiredWorkflowType(value: string): string {
  return normalizeRequiredText(value, { fieldName: 'workflowType' });
}

function isAiWorkflowHandler(value: unknown): value is AiWorkflowHandler {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as {
    readonly workflowType?: unknown;
    readonly handle?: unknown;
  };
  return typeof candidate.workflowType === 'string' && typeof candidate.handle === 'function';
}
