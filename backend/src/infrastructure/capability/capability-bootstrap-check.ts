import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CapabilityBootstrapError, CapabilityRegistry } from './capability.registry';
import { ConfigCapabilityStateReader } from './config-capability-state.reader';

@Injectable()
export class CapabilityBootstrapCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(CapabilityBootstrapCheck.name);

  constructor(
    private readonly capabilityRegistry: CapabilityRegistry,
    private readonly capabilityStateReader: ConfigCapabilityStateReader,
  ) {}

  onApplicationBootstrap(): void {
    const issues = this.capabilityRegistry.getValidationIssues();
    if (issues.length > 0) {
      throw new CapabilityBootstrapError(this.capabilityRegistry.process, issues);
    }
    for (const warning of this.capabilityStateReader.getConfigurationWarnings()) {
      this.logger.warn(warning.message);
    }
  }
}
