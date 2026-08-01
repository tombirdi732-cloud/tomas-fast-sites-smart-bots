import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  boxId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CollectOrderDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Код выдачи состоит из шести цифр' })
  pickupCode!: string;
}

export class CreateReviewDto {
  @IsUUID()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReplyReviewDto {
  @IsString()
  @MaxLength(2000)
  reply!: string;
}
