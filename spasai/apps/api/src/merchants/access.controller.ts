import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Merchant, UserRole } from '@prisma/client';

import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { AccessService, type InviteResult } from './access.service';

class CreateInviteDto {
  /** Для кого код — видно в списке приглашений. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

class JoinDto {
  @IsString()
  @Length(6, 16)
  code!: string;
}

/** Приглашения заведений — выписывает администратор платформы. */
@Roles(UserRole.admin)
@Controller('admin/invites')
export class AdminInvitesController {
  constructor(private readonly access: AccessService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto): Promise<InviteResult> {
    return this.access.createMerchantInvite(user.id, dto);
  }
}

/** Сотрудники заведения — управляет владелец. */
@Roles(UserRole.merchant, UserRole.admin)
@Controller('merchants/me/staff')
export class MerchantStaffController {
  constructor(private readonly access: AccessService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('merchantId') merchantId?: string) {
    const merchant = await this.access.requireAccess(user.id, merchantId);
    return this.access.listStaff(merchant.id);
  }

  /** Код для кассира: показать в панели, продиктовать сотруднику. */
  @Post('invite')
  async invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<InviteResult> {
    const merchant = await this.access.requireAccess(user.id, merchantId);
    return this.access.createStaffInvite(user.id, merchant.id, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('merchantId') merchantId?: string,
  ): Promise<void> {
    const merchant = await this.access.requireAccess(user.id, merchantId);
    await this.access.removeStaff(user.id, merchant.id, userId);
  }
}

/** Вход сотрудника по коду — доступен любому авторизованному пользователю. */
@Controller('merchants/join')
export class MerchantJoinController {
  constructor(private readonly access: AccessService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinDto): Promise<Merchant> {
    return this.access.joinByInvite(user.id, dto.code);
  }
}
