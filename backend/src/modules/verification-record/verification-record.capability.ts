import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';

export const IDENTITY_VERIFICATION_CAPABILITY_ID = 'identity.verification' as const;

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: IDENTITY_VERIFICATION_CAPABILITY_ID,
  mode: 'always-on',
  decisionRef: 'docs/capabilities/current.md',
  requires: [],
})
export class IdentityVerificationCapabilityAnchor {}
