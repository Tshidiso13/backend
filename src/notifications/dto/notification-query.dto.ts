import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

import {
  Transform,
  Type,
} from "class-transformer";

export const NOTIFICATION_TYPES = [
  "ORDER",
  "PAYMENT",
  "INVENTORY",
  "DISPUTE",
  "DELIVERY",
  "CUSTOMER",
  "SYSTEM",
] as const;

export const NOTIFICATION_PRIORITIES = [
  "NORMAL",
  "IMPORTANT",
  "URGENT",
] as const;

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsIn(NOTIFICATION_TYPES)
  type?: (typeof NOTIFICATION_TYPES)[number];

  @IsOptional()
  @IsIn(NOTIFICATION_PRIORITIES)
  priority?: (typeof NOTIFICATION_PRIORITIES)[number];

  @IsOptional()
  @Transform(({ value }) => {
    if (
      value === true ||
      value === "true"
    ) {
      return true;
    }

    if (
      value === false ||
      value === "false"
    ) {
      return false;
    }

    return value;
  })
  @IsBoolean()
  unreadOnly?: boolean;
}
