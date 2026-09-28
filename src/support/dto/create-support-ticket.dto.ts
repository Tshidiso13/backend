import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import {
  Transform,
} from "class-transformer";

export enum SupportCategoryDto {
  ORDER =
    "ORDER",
  DELIVERY =
    "DELIVERY",
  PAYMENT =
    "PAYMENT",
  ACCOUNT =
    "ACCOUNT",
  PRODUCT =
    "PRODUCT",
  RETURNS =
    "RETURNS",
  OTHER =
    "OTHER",
}

export class CreateSupportTicketDto {
  @IsEnum(
    SupportCategoryDto
  )
  category!:
    SupportCategoryDto;

  @IsString()
  @MinLength(4)
  @MaxLength(140)
  @Transform(
    ({
      value,
    }) =>
      typeof value ===
      "string"
        ? value
            .trim()
            .replace(
              /\s+/g,
              " "
            )
        : value
  )
  subject!:
    string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  @Transform(
    ({
      value,
    }) =>
      typeof value ===
      "string"
        ? value.trim()
        : value
  )
  message!:
    string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(
    ({
      value,
    }) => {
      if (
        typeof value !==
        "string"
      ) {
        return value;
      }

      const cleaned =
        value.trim();

      return cleaned ||
        undefined;
    }
  )
  orderNumber?:
    string;
}
