import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversationEntity } from './entities/ai-conversation.entity';
import { AiMessageEntity } from './entities/ai-message.entity';
import { AiReportEntity } from './entities/ai-report.entity';
import { EngineerResponseEntity } from './entities/engineer-response.entity';
import { EquipmentModelEntity } from './entities/equipment-model.entity';
import { ReferenceDocumentEntity } from './entities/reference-document.entity';
import { RepairRequestEntity } from './entities/repair-request.entity';
import { EquipmentModelQueryService } from './queries/equipment-model.query.service';
import { RepairRequestQueryService } from './queries/repair-request.query.service';
import { RepairRequestService } from './repair-request.service';

const LITHOGRAPHY_ENTITIES = [
  EquipmentModelEntity,
  RepairRequestEntity,
  AiConversationEntity,
  AiMessageEntity,
  AiReportEntity,
  EngineerResponseEntity,
  ReferenceDocumentEntity,
] as const;

@Module({
  imports: [TypeOrmModule.forFeature([...LITHOGRAPHY_ENTITIES])],
  providers: [EquipmentModelQueryService, RepairRequestQueryService, RepairRequestService],
  exports: [
    TypeOrmModule,
    EquipmentModelQueryService,
    RepairRequestQueryService,
    RepairRequestService,
  ],
})
export class LithographyModule {}
