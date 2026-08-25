// src/infrastructure/logger/logger.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    ConfigModule,
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          pinoHttp: {
            level: configService.get<string>('logger.level', 'info'),
            transport: configService.get('logger.transport'),
            redact: configService.get<string[]>('logger.redactFields', []),
            customProps: configService.get('logger.customProps'),
            customLogLevel: configService.get('logger.customLogLevel'),
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
