import { Injectable } from '@nestjs/common';
import { CapabilityAnchorProvider } from '@src/infrastructure/capability/capability.decorators';
import { RUNTIME_EMAIL_DELIVERY_CAPABILITY_ID } from './email-capability.constants';

@Injectable()
@CapabilityAnchorProvider({
  capabilityId: RUNTIME_EMAIL_DELIVERY_CAPABILITY_ID,
  mode: 'switchable',
  decisionRef: 'docs/capabilities/runtime-email-delivery.md',
  requires: [],
})
export class RuntimeEmailDeliveryCapabilityAnchor {}
