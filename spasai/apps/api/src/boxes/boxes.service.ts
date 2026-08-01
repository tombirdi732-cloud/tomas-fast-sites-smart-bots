import { Injectable, Logger } from '@nestjs/common';
import { Box, BoxStatus, MerchantStatus, Prisma } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { BoxErrorCode } from '../common/errors/error-codes';
import { discountPercent } from '../common/money';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBoxDto, SearchBoxesDto, UpdateBoxDto } from './boxes.dto';

/** Строка выдачи геопоиска — то, что рисует карточку в ленте. */
export interface BoxListItem {
  id: string;
  title: string;
  description: string | null;
  price: number;
  originalPrice: number;
  discountPercent: number;
  quantityLeft: number;
  bestBefore: string;
  pickupStart: string;
  pickupEnd: string;
  category: string;
  allergens: string[];
  photoUrl: string | null;
  distanceM: number;
  merchant: {
    id: string;
    title: string;
    address: string;
    lat: number;
    lng: number;
    logoUrl: string | null;
    ratingAvg: number;
    ratingCount: number;
    timezone: string;
  };
}

/** Сырая строка из SQL-геозапроса. */
interface BoxSearchRow {
  id: string;
  title: string;
  description: string | null;
  price: number;
  original_price: number;
  quantity_left: number;
  best_before: Date;
  pickup_start: Date;
  pickup_end: Date;
  category: string;
  allergens: string[];
  photo_url: string | null;
  distance_m: number;
  merchant_id: string;
  merchant_title: string;
  merchant_address: string;
  merchant_lat: number;
  merchant_lng: number;
  merchant_logo_url: string | null;
  merchant_rating_avg: Prisma.Decimal;
  merchant_rating_count: number;
  merchant_timezone: string;
}

const DEFAULT_RADIUS_M = 3_000;
const DEFAULT_LIMIT = 20;

@Injectable()
export class BoxesService {
  private readonly logger = new Logger(BoxesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  /**
   * Правила раздела 7.1: срок годности обязан наступать позже конца окна
   * выдачи, окно должно быть непустым, цена — не выше исходной.
   * Дублируется CHECK-констрейнтами в БД, но пользователю нужна внятная ошибка.
   */
  private static assertBoxRules(input: {
    bestBefore: Date;
    pickupStart: Date;
    pickupEnd: Date;
    price: number;
    originalPrice: number;
    isRecurring?: boolean;
    recurrenceRule?: string | null;
  }): void {
    if (input.pickupEnd <= input.pickupStart) {
      throw ApiException.badRequest(
        BoxErrorCode.PICKUP_WINDOW_INVALID,
        'Окно выдачи должно заканчиваться позже, чем начинается',
      );
    }

    if (input.bestBefore <= input.pickupEnd) {
      throw ApiException.badRequest(
        BoxErrorCode.BEST_BEFORE_TOO_EARLY,
        'Срок годности истекает раньше конца окна выдачи — такой бокс продавать нельзя',
        {
          bestBefore: input.bestBefore.toISOString(),
          pickupEnd: input.pickupEnd.toISOString(),
        },
      );
    }

    if (input.price > input.originalPrice) {
      throw ApiException.badRequest(
        BoxErrorCode.PRICE_ABOVE_ORIGINAL,
        'Цена со скидкой не может быть выше исходной',
      );
    }

    if (input.isRecurring && !input.recurrenceRule) {
      throw ApiException.badRequest(
        BoxErrorCode.RECURRENCE_RULE_REQUIRED,
        'Для повторяющегося бокса нужно задать расписание',
      );
    }
  }

  async create(userId: string, merchantId: string | undefined, dto: CreateBoxDto): Promise<Box> {
    const merchant = await this.merchants.requireOwned(userId, merchantId);
    MerchantsService.assertApproved(merchant);

    const bestBefore = new Date(dto.bestBefore);
    const pickupStart = new Date(dto.pickupStart);
    const pickupEnd = new Date(dto.pickupEnd);

    BoxesService.assertBoxRules({
      bestBefore,
      pickupStart,
      pickupEnd,
      price: dto.price,
      originalPrice: dto.originalPrice,
      isRecurring: dto.isRecurring,
      recurrenceRule: dto.recurrenceRule ?? null,
    });

    const box = await this.prisma.box.create({
      data: {
        merchantId: merchant.id,
        title: dto.title,
        description: dto.description ?? null,
        originalPrice: dto.originalPrice,
        price: dto.price,
        quantityTotal: dto.quantityTotal,
        quantityLeft: dto.quantityTotal,
        bestBefore,
        pickupStart,
        pickupEnd,
        category: dto.category,
        allergens: dto.allergens ?? [],
        photoUrl: dto.photoUrl ?? null,
        isRecurring: dto.isRecurring ?? false,
        recurrenceRule: dto.recurrenceRule ?? null,
        status: BoxStatus.active,
      },
    });

    this.logger.log(`Бокс создан: ${box.title} (${merchant.title}), остаток ${box.quantityLeft}`);
    return box;
  }

  async update(userId: string, boxId: string, dto: UpdateBoxDto): Promise<Box> {
    const box = await this.prisma.box.findUnique({ where: { id: boxId } });
    if (!box) throw ApiException.notFound('Бокс не найден');

    await this.merchants.requireOwned(userId, box.merchantId);

    const bestBefore = dto.bestBefore ? new Date(dto.bestBefore) : box.bestBefore;
    const pickupStart = dto.pickupStart ? new Date(dto.pickupStart) : box.pickupStart;
    const pickupEnd = dto.pickupEnd ? new Date(dto.pickupEnd) : box.pickupEnd;
    const price = dto.price ?? box.price;

    BoxesService.assertBoxRules({
      bestBefore,
      pickupStart,
      pickupEnd,
      price,
      originalPrice: box.originalPrice,
      isRecurring: box.isRecurring,
      recurrenceRule: box.recurrenceRule,
    });

    // Количество нельзя опустить ниже уже проданного.
    let quantityTotal = box.quantityTotal;
    let quantityLeft = box.quantityLeft;
    if (dto.quantityTotal !== undefined) {
      const sold = box.quantityTotal - box.quantityLeft;
      if (dto.quantityTotal < sold) {
        throw ApiException.badRequest(
          BoxErrorCode.NOT_ENOUGH_QUANTITY,
          `Уже продано ${sold} шт. — общее количество не может быть меньше`,
          { sold },
        );
      }
      quantityTotal = dto.quantityTotal;
      quantityLeft = dto.quantityTotal - sold;
    }

    return this.prisma.box.update({
      where: { id: boxId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.allergens !== undefined ? { allergens: dto.allergens } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.status !== undefined
          ? { status: dto.status === 'cancelled' ? BoxStatus.cancelled : BoxStatus.active }
          : {}),
        price,
        bestBefore,
        pickupStart,
        pickupEnd,
        quantityTotal,
        quantityLeft,
      },
    });
  }

  listMine(merchantId: string, includeInactive: boolean): Promise<Box[]> {
    return this.prisma.box.findMany({
      where: {
        merchantId,
        ...(includeInactive ? {} : { status: BoxStatus.active }),
      },
      orderBy: { pickupStart: 'asc' },
    });
  }

  /** Публичная карточка бокса (экран 6 мобильного приложения). */
  async findPublic(id: string): Promise<BoxListItem> {
    const box = await this.prisma.box.findFirst({
      where: { id, merchant: { status: MerchantStatus.approved } },
      include: { merchant: true },
    });

    if (!box) throw ApiException.notFound('Бокс не найден');

    return {
      id: box.id,
      title: box.title,
      description: box.description,
      price: box.price,
      originalPrice: box.originalPrice,
      discountPercent: discountPercent(box.originalPrice, box.price),
      quantityLeft: box.quantityLeft,
      bestBefore: box.bestBefore.toISOString(),
      pickupStart: box.pickupStart.toISOString(),
      pickupEnd: box.pickupEnd.toISOString(),
      category: box.category,
      allergens: box.allergens,
      photoUrl: box.photoUrl,
      distanceM: 0,
      merchant: {
        id: box.merchant.id,
        title: box.merchant.title,
        address: box.merchant.address,
        lat: box.merchant.lat,
        lng: box.merchant.lng,
        logoUrl: box.merchant.logoUrl,
        ratingAvg: Number(box.merchant.ratingAvg),
        ratingCount: box.merchant.ratingCount,
        timezone: box.merchant.timezone,
      },
    };
  }

  /**
   * Геопоиск (раздел 7.8): ST_DWithin по радиусу, сортировка по расстоянию.
   * Индекс merchants_geo_idx построен ровно по этому выражению.
   */
  async search(query: SearchBoxesDto, userId?: string): Promise<BoxListItem[]> {
    const radius = query.radius ?? DEFAULT_RADIUS_M;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;

    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}::double precision, ${query.lat}::double precision), 4326)::geography`;
    const merchantPoint = Prisma.sql`ST_SetSRID(ST_MakePoint(m."lng", m."lat"), 4326)::geography`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`b."status" = 'active'::"BoxStatus"`,
      Prisma.sql`b."quantity_left" > 0`,
      Prisma.sql`b."pickup_end" > now()`,
      Prisma.sql`m."status" = 'approved'::"MerchantStatus"`,
      Prisma.sql`ST_DWithin(${merchantPoint}, ${point}, ${radius}::double precision)`,
    ];

    if (query.category) {
      filters.push(Prisma.sql`b."category" = ${query.category}`);
    }
    if (query.maxPrice !== undefined) {
      filters.push(Prisma.sql`b."price" <= ${query.maxPrice}`);
    }
    if (query.pickupBefore) {
      filters.push(Prisma.sql`b."pickup_start" <= ${new Date(query.pickupBefore)}`);
    }
    if (query.favoritesOnly && userId) {
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "favorites" f WHERE f."merchant_id" = m."id" AND f."user_id" = ${userId}::uuid)`,
      );
    }

    const rows = await this.prisma.$queryRaw<BoxSearchRow[]>`
      SELECT
        b."id", b."title", b."description", b."price", b."original_price",
        b."quantity_left", b."best_before", b."pickup_start", b."pickup_end",
        b."category", b."allergens", b."photo_url",
        ST_Distance(${merchantPoint}, ${point}) AS distance_m,
        m."id"           AS merchant_id,
        m."title"        AS merchant_title,
        m."address"      AS merchant_address,
        m."lat"          AS merchant_lat,
        m."lng"          AS merchant_lng,
        m."logo_url"     AS merchant_logo_url,
        m."rating_avg"   AS merchant_rating_avg,
        m."rating_count" AS merchant_rating_count,
        m."timezone"     AS merchant_timezone
      FROM "boxes" b
      JOIN "merchants" m ON m."id" = b."merchant_id"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY distance_m ASC, b."price" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      price: row.price,
      originalPrice: row.original_price,
      discountPercent: discountPercent(row.original_price, row.price),
      quantityLeft: row.quantity_left,
      bestBefore: row.best_before.toISOString(),
      pickupStart: row.pickup_start.toISOString(),
      pickupEnd: row.pickup_end.toISOString(),
      category: row.category,
      allergens: row.allergens,
      photoUrl: row.photo_url,
      distanceM: Math.round(row.distance_m),
      merchant: {
        id: row.merchant_id,
        title: row.merchant_title,
        address: row.merchant_address,
        lat: row.merchant_lat,
        lng: row.merchant_lng,
        logoUrl: row.merchant_logo_url,
        ratingAvg: Number(row.merchant_rating_avg),
        ratingCount: row.merchant_rating_count,
        timezone: row.merchant_timezone,
      },
    }));
  }

  /**
   * Автоистечение (раздел 7.3): боксы, чьё окно выдачи закончилось,
   * переводятся в expired. Вызывается по расписанию каждые 5 минут.
   */
  async expireStaleBoxes(): Promise<number> {
    const result = await this.prisma.box.updateMany({
      where: { status: BoxStatus.active, pickupEnd: { lt: new Date() } },
      data: { status: BoxStatus.expired },
    });

    if (result.count > 0) {
      this.logger.log(`Истекло боксов: ${result.count}`);
    }
    return result.count;
  }
}
