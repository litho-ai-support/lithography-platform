import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';
import { AI_CAPABILITY_ID, AI_EXECUTION_CAPABILITY_ID } from './ai-capability.constants';

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: AI_CAPABILITY_ID,
  mode: 'switchable',
  decisionRef: 'docs/capabilities/current.md',
  requires: [],
})
export class AiCapabilityAnchor {}

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: AI_EXECUTION_CAPABILITY_ID,
  mode: 'switchable',
  decisionRef: 'docs/capabilities/ai-execution.md',
  requires: ['runtime.async-task'],
})
export class AiExecutionCapabilityAnchor {}
