import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';

export const RUNTIME_ASYNC_TASK_CAPABILITY_ID = 'runtime.async-task' as const;

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: RUNTIME_ASYNC_TASK_CAPABILITY_ID,
  mode: 'switchable',
  decisionRef: 'docs/capabilities/current.md',
  requires: [],
})
export class RuntimeAsyncTaskCapabilityAnchor {}
