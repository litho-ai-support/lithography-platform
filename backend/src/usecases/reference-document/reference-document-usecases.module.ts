// src/usecases/reference-document/reference-document-usecases.module.ts

import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { LithographyModule } from '@src/modules/lithography/lithography.module';
import { CreateReferenceDocumentUsecase } from './create-reference-document.usecase';
import { GetReferenceDocumentDetailUsecase } from './get-reference-document-detail.usecase';
import { GetReferenceDocumentFileUsecase } from './get-reference-document-file.usecase';
import { ListReferenceDocumentsUsecase } from './list-reference-documents.usecase';
import { SoftDeleteReferenceDocumentUsecase } from './soft-delete-reference-document.usecase';
import { UpdateReferenceDocumentUsecase } from './update-reference-document.usecase';

@Module({
  imports: [LithographyModule, AccountInstallerModule],
  providers: [
    CreateReferenceDocumentUsecase,
    GetReferenceDocumentDetailUsecase,
    GetReferenceDocumentFileUsecase,
    ListReferenceDocumentsUsecase,
    SoftDeleteReferenceDocumentUsecase,
    UpdateReferenceDocumentUsecase,
  ],
  exports: [
    CreateReferenceDocumentUsecase,
    GetReferenceDocumentDetailUsecase,
    GetReferenceDocumentFileUsecase,
    ListReferenceDocumentsUsecase,
    SoftDeleteReferenceDocumentUsecase,
    UpdateReferenceDocumentUsecase,
  ],
})
export class ReferenceDocumentUsecasesModule {}
