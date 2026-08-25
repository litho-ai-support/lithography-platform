import { Inject, Injectable } from '@nestjs/common';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';

@Injectable()
export class AiWorkflowWorkerActivationUsecase {
  constructor(
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {}

  shouldRun(): boolean {
    return this.capabilityStateReader.getState('ai.workflow').effectiveState === 'enabled';
  }
}
