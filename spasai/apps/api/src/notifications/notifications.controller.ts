import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsUUID } from 'class-validator';
import { Notification } from '@prisma/client';

import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

class MarkReadDto {
  /** Не указан — помечаем прочитанными все. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly === 'true' ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthUser, @Body() dto: MarkReadDto): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false, ...(dto.ids ? { id: { in: dto.ids } } : {}) },
      data: { isRead: true },
    });
  }
}
