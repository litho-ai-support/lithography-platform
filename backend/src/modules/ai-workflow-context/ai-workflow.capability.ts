import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';

export const AI_WORKFLOW_CAPABILITY_ID = 'ai.workflow' as const;

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: AI_WORKFLOW_CAPABILITY_ID,
  mode: 'switchable',
  decisionRef: 'docs/capabilities/ai-workflow.md',
  requires: ['ai.execution'],
})
export class AiWorkflowCapabilityAnchor {}
