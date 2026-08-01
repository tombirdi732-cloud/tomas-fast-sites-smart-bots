import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** Российский номер в формате +7XXXXXXXXXX. */
const PHONE_RE = /^\+7\d{10}$/;

/**
 * Приводит ввод пользователя к каноническому виду: 8 (999) 000-00-01 → +79990000001.
 * Хранить в БД разнобой нельзя — на телефоне держится уникальность аккаунта.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  return raw.trim();
}

export class RequestCodeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @IsString()
  @Matches(PHONE_RE, { message: 'Телефон должен быть в формате +7XXXXXXXXXX' })
  phone!: string;
}

export class VerifyCodeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @IsString()
  @Matches(PHONE_RE, { message: 'Телефон должен быть в формате +7XXXXXXXXXX' })
  phone!: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Код состоит из четырёх цифр' })
  code!: string;

  /** Имя указывается при первом входе. */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  fcmToken?: string;
}
