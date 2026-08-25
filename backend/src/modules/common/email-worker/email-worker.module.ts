// src/modules/common/email-worker/email-worker.module.ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCapabilityModule } from '../email-capability/email-capability.module';
import { EmailDeliveryService } from './email-delivery.service';
import { EMAIL_DELIVERY_OPTIONS, type EmailDeliveryOptions } from './email-worker.options';

@Module({
  imports: [EmailCapabilityModule],
  providers: [
    {
      provide: EMAIL_DELIVERY_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): EmailDeliveryOptions => ({
        runAsUser: configService.get<string>('emailDelivery.sendAsUser'),
        sendmailPath: configService.get<string>('emailDelivery.sendmailPath', '/usr/sbin/sendmail'),
      }),
    },
    EmailDeliveryService,
  ],
  exports: [EmailDeliveryService],
})
export class EmailWorkerModule {}
