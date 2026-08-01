import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Box, UserRole } from '@prisma/client';

import { AuthUser, CurrentUser, Public, Roles } from '../auth/auth.decorators';
import { MerchantsService } from '../merchants/merchants.service';
import { BoxListItem, BoxesService } from './boxes.service';
import { CreateBoxDto, SearchBoxesDto, UpdateBoxDto } from './boxes.dto';

/** Публичная витрина: лента и карточка бокса. */
@Controller('boxes')
export class BoxesController {
  constructor(private readonly boxes: BoxesService) {}

  /**
   * GET /boxes?lat&lng&radius&category&maxPrice&limit&offset
   * Доступен без токена: лента показывается ещё до входа.
   */
  @Public()
  @Get()
  search(@Query() query: SearchBoxesDto): Promise<BoxListItem[]> {
    return this.boxes.search(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BoxListItem> {
    return this.boxes.findPublic(id);
  }
}

/** Боксы в панели заведения. */
@Roles(UserRole.merchant, UserRole.admin)
@Controller('merchants/me/boxes')
export class MerchantBoxesController {
  constructor(
    private readonly boxes: BoxesService,
    private readonly merchants: MerchantsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query('merchantId') merchantId?: string,
    @Query('all') all?: string,
  ): Promise<Box[]> {
    const merchant = await this.merchants.requireOwned(user.id, merchantId);
    return this.boxes.listMine(merchant.id, all === 'true');
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBoxDto,
    @Query('merchantId') merchantId?: string,
  ): Promise<Box> {
    return this.boxes.create(user.id, merchantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoxDto,
  ): Promise<Box> {
    return this.boxes.update(user.id, id, dto);
  }
}
