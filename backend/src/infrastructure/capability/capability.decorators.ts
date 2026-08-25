import type {
  CapabilityAnchor,
  CapabilityRuntimeContribution,
} from '@app-types/common/capability.types';
import { DiscoveryService } from '@nestjs/core';

export const CAPABILITY_ANCHOR_DISCOVERABLE = DiscoveryService.createDecorator<CapabilityAnchor>();
export const CAPABILITY_RUNTIME_CONTRIBUTION_DISCOVERABLE =
  DiscoveryService.createDecorator<CapabilityRuntimeContribution>();

export const CAPABILITY_ANCHOR_METADATA_KEY = CAPABILITY_ANCHOR_DISCOVERABLE.KEY;
export const CAPABILITY_RUNTIME_CONTRIBUTION_METADATA_KEY =
  CAPABILITY_RUNTIME_CONTRIBUTION_DISCOVERABLE.KEY;

const capabilityAnchorProvider = (anchor: CapabilityAnchor): ClassDecorator =>
  CAPABILITY_ANCHOR_DISCOVERABLE(anchor);

const capabilityRuntimeContributionProvider = (
  contribution: CapabilityRuntimeContribution,
): ClassDecorator => CAPABILITY_RUNTIME_CONTRIBUTION_DISCOVERABLE(contribution);

export {
  capabilityAnchorProvider as CapabilityAnchorProvider,
  capabilityRuntimeContributionProvider as CapabilityRuntimeContributionProvider,
};
