// src/adapters/api/rest/rest-adapter.module.ts

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReferenceDocumentUsecasesModule } from '@src/usecases/reference-document/reference-document-usecases.module';

import { ReferenceDocumentRestController } from './reference-document/reference-document-rest.controller';
import {
  REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
  REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
} from './rest-adapter.tokens';

/** REST 边界装配（文件上传/下载等多部分端点；GraphQL 继续负责查询与其他操作） */
@Module({
  imports: [ReferenceDocumentUsecasesModule],
  controllers: [ReferenceDocumentRestController],
  providers: [
    {
      provide: REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
      useFactory: (configService: ConfigService) =>
        configService.get<number>('referenceDocumentStorage.uploadMaxBytes', 20 * 1024 * 1024),
      inject: [ConfigService],
    },
    {
      provide: REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
      useFactory: (configService: ConfigService) =>
        configService.get<string[]>('referenceDocumentStorage.allowedMimeTypes', []),
      inject: [ConfigService],
    },
  ],
})
export class RestAdapterModule {}
