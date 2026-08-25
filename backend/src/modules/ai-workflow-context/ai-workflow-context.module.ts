// src/modules/ai-workflow-context/ai-workflow-context.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiWorkflowContextEntity } from './ai-workflow-context.entity';
import { AiWorkflowContextService } from './ai-workflow-context.service';
import { AiWorkflowCapabilityAnchor } from './ai-workflow.capability';

@Module({
  imports: [TypeOrmModule.forFeature([AiWorkflowContextEntity])],
  providers: [AiWorkflowCapabilityAnchor, AiWorkflowContextService],
  exports: [TypeOrmModule, AiWorkflowContextService],
})
export class AiWorkflowContextModule {}
