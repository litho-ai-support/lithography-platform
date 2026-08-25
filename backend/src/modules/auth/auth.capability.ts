import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';

export const IDENTITY_AUTHENTICATION_CAPABILITY_ID = 'identity.authentication' as const;

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: IDENTITY_AUTHENTICATION_CAPABILITY_ID,
  mode: 'always-on',
  decisionRef: 'docs/capabilities/current.md',
  requires: ['identity.account'],
})
export class IdentityAuthenticationCapabilityAnchor {}
