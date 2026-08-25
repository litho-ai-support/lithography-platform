import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';

export const IDENTITY_ACCOUNT_CAPABILITY_ID = 'identity.account' as const;

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: IDENTITY_ACCOUNT_CAPABILITY_ID,
  mode: 'always-on',
  decisionRef: 'docs/capabilities/current.md',
  requires: [],
})
export class IdentityAccountCapabilityAnchor {}
