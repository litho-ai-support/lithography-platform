// src/infrastructure/file-storage/local-reference-document-storage.module.ts

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
  REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
} from '@src/usecases/reference-document/reference-document-upload.contract';
import { REFERENCE_DOCUMENT_STORAGE } from '@src/usecases/reference-document/reference-document-storage.contract';

import { LocalReferenceDocumentStorage } from './local-reference-document-storage';

/**
 * 参考资料文件存储与上传策略 token 装配（与 TypeOrmTransactionModule 同模式：全局 + useExisting）。
 * 运行时配置读取归 infrastructure wiring（架构规则）；上传大小/MIME 白名单由本模块注入，
 * usecase 层作为业务规则单一真源消费（负责人 0910 架构要求）。
 */
@Global()
@Module({
  providers: [
    LocalReferenceDocumentStorage,
    { provide: REFERENCE_DOCUMENT_STORAGE, useExisting: LocalReferenceDocumentStorage },
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
  exports: [
    REFERENCE_DOCUMENT_STORAGE,
    REFERENCE_DOCUMENT_UPLOAD_MAX_BYTES,
    REFERENCE_DOCUMENT_ALLOWED_MIME_TYPES,
  ],
})
export class LocalReferenceDocumentStorageModule {}
