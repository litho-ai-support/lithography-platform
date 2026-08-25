// src/adapters/api/graphql/repair-request/repair-request.resolver.ts

import { JwtPayload } from '@app-types/jwt.types';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { CreateRepairRequestUsecase } from '@src/usecases/repair-request/create-repair-request.usecase';
import { CreateRepairRequestInput } from './dto/create-repair-request.input';
import { RepairRequestDTO } from './dto/repair-request.dto';

/**
 * 维修申请 GraphQL 解析器
 * 仅做协议映射：结构校验 → 调用 usecase → 输出 DTO
 * 业务异常不在此捕获，交由全局过滤器映射为 GraphQL 错误契约
 */
@Resolver(() => RepairRequestDTO)
export class RepairRequestResolver {
  constructor(private readonly createRepairRequestUsecase: CreateRepairRequestUsecase) {}

  /**
   * 客户创建维修申请
   * 仅 CUSTOMER 可提交；customerAccountId 取自会话，客户端不可传入
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.CUSTOMER)
  @Mutation(() => RepairRequestDTO, { description: '客户创建维修申请' })
  @ValidateInput()
  async createRepairRequest(
    @Args('input') input: CreateRepairRequestInput,
    @currentUser() user: JwtPayload,
  ): Promise<RepairRequestDTO> {
    const snapshot = await this.createRepairRequestUsecase.execute({
      session: {
        accountId: user.sub,
        accessGroup: user.accessGroup,
      },
      equipmentModelId: input.equipmentModelId,
      errorCode: input.errorCode,
      faultDescription: input.faultDescription,
    });
    return {
      id: snapshot.id,
      requestNo: snapshot.requestNo,
      equipmentModelId: snapshot.equipmentModelId,
      errorCode: snapshot.errorCode,
      faultDescription: snapshot.faultDescription,
      createdAt: snapshot.createdAt,
      isAccepted: snapshot.isAccepted,
    };
  }
}
