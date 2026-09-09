// src/infrastructure/file-storage/local-reference-document-storage.module.ts

import { Global, Module } from '@nestjs/common';

import { REFERENCE_DOCUMENT_STORAGE } from '@src/usecases/reference-document/reference-document-storage.contract';

import { LocalReferenceDocumentStorage } from './local-reference-document-storage';

/** 参考资料文件存储 token 装配（与 TypeOrmTransactionModule 同模式：全局 + useExisting） */
@Global()
@Module({
  providers: [
    LocalReferenceDocumentStorage,
    { provide: REFERENCE_DOCUMENT_STORAGE, useExisting: LocalReferenceDocumentStorage },
  ],
  exports: [REFERENCE_DOCUMENT_STORAGE],
})
export class LocalReferenceDocumentStorageModule {}
