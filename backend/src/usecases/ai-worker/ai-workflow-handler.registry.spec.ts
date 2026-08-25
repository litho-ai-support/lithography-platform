/// <reference types="jest" />
import type { DiscoveryService } from '@nestjs/core';
import { AiWorkflowHandlerRegistry } from './ai-workflow-handler.registry';
import type { AiWorkflowHandler } from './ai-workflow-handler.types';
import { AiWorkflowNonRetryableError } from './ai-workflow-worker-errors';

describe('AiWorkflowHandlerRegistry', () => {
  it('returns registered handler by normalized workflow type', () => {
    const handler = createHandler({ workflowType: ' generic_text_generate ' });
    const registry = new AiWorkflowHandlerRegistry(createDiscoveryService([handler]));

    expect(registry.getHandler('generic_text_generate')).toBe(handler);
  });

  it('throws non-retryable error when handler is missing', () => {
    const registry = new AiWorkflowHandlerRegistry(createDiscoveryService([]));

    expect(() => registry.getHandler('missing')).toThrow(AiWorkflowNonRetryableError);
    try {
      registry.getHandler('missing');
    } catch (error) {
      expect(error).toMatchObject({
        reason: 'WORKFLOW_HANDLER_NOT_FOUND',
        message: 'workflow_handler_not_found',
      });
    }
  });

  it('rejects duplicate workflow type during registry construction', () => {
    const registry = new AiWorkflowHandlerRegistry(
      createDiscoveryService([
        createHandler({ workflowType: 'generic_text_generate' }),
        createHandler({ workflowType: ' generic_text_generate ' }),
      ]),
    );

    expect(() => registry.getHandler('generic_text_generate')).toThrow(
      'duplicate_ai_workflow_handler:generic_text_generate',
    );
  });
});

function createHandler(input: { readonly workflowType: string }): AiWorkflowHandler {
  return {
    workflowType: input.workflowType,
    handle: jest.fn(),
  };
}

function createDiscoveryService(handlers: readonly AiWorkflowHandler[]): DiscoveryService {
  return {
    getProviders: jest.fn(() =>
      handlers.map((handler) => ({
        instance: handler,
      })),
    ),
  } as unknown as DiscoveryService;
}
