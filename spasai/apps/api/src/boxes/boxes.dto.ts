import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBoxDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** Цена до скидки, копейки. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  originalPrice!: number;

  /** Цена продажи, копейки. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantityTotal!: number;

  /** Срок годности, ISO 8601 в UTC. Обязателен (раздел 7.1 ТЗ). */
  @IsDateString()
  bestBefore!: string;

  @IsDateString()
  pickupStart!: string;

  @IsDateString()
  pickupEnd!: string;

  @IsString()
  @Length(2, 64)
  category!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  photoUrl?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recurrenceRule?: string;
}

export class UpdateBoxDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  /** Новое общее количество. Нельзя опустить ниже уже проданного. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  quantityTotal?: number;

  @IsOptional()
  @IsDateString()
  bestBefore?: string;

  @IsOptional()
  @IsDateString()
  pickupStart?: string;

  @IsOptional()
  @IsDateString()
  pickupEnd?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  photoUrl?: string;

  /** Снять с продажи. */
  @IsOptional()
  @IsIn(['active', 'cancelled'])
  status?: 'active' | 'cancelled';
}

/** Параметры геопоиска: GET /boxes?lat&lng&radius&… (раздел 8 ТЗ). */
export class SearchBoxesDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  /** Радиус поиска в метрах. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50_000)
  radius?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /** Верхняя граница цены, копейки. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** Только боксы, которые можно забрать не позже этого момента. */
  @IsOptional()
  @IsDateString()
  pickupBefore?: string;

  /** Только избранные заведения текущего пользователя. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favoritesOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
