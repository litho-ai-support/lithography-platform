import type { CapabilityProcess } from '@app-types/common/capability.types';
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { CAPABILITY_STATE_READER } from '@src/modules/common/capability-state-reader.contract';
import { CapabilityBootstrapCheck } from './capability-bootstrap-check';
import { CAPABILITY_PROCESS, CapabilityRegistry } from './capability.registry';
import { ConfigCapabilityStateReader } from './config-capability-state.reader';

export interface CapabilityModuleOptions {
  readonly process: CapabilityProcess;
}

@Global()
@Module({})
export class CapabilityModule {
  static forRoot(options: CapabilityModuleOptions): DynamicModule {
    return {
      module: CapabilityModule,
      global: true,
      imports: [ConfigModule, DiscoveryModule],
      providers: [
        { provide: CAPABILITY_PROCESS, useValue: options.process },
        CapabilityRegistry,
        ConfigCapabilityStateReader,
        CapabilityBootstrapCheck,
        { provide: CAPABILITY_STATE_READER, useExisting: ConfigCapabilityStateReader },
      ],
      exports: [CAPABILITY_STATE_READER],
    };
  }
}
