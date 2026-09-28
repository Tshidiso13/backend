import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import {
  Transform,
} from "class-transformer";

function cleanOptionalString({
  value,
}: {
  value:
    unknown;
}) {
  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  const cleaned =
    value
      .trim()
      .replace(
        /\s+/g,
        " "
      );

  return cleaned.length >
    0
    ? cleaned
    : undefined;
}

function cleanRequiredString({
  value,
}: {
  value:
    unknown;
}) {
  return typeof value ===
    "string"
    ? value
        .trim()
        .replace(
          /\s+/g,
          " "
        )
    : value;
}

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(
    cleanOptionalString
  )
  label?:
    string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredString
  )
  recipientName!:
    string;

  @IsString()
  @MinLength(7)
  @MaxLength(30)
  @Transform(
    cleanRequiredString
  )
  phone!:
    string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Transform(
    cleanRequiredString
  )
  addressLine1!:
    string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(
    cleanOptionalString
  )
  addressLine2?:
    string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(
    cleanOptionalString
  )
  suburb?:
    string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredString
  )
  city!:
    string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredString
  )
  province!:
    string;

  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Transform(
    cleanRequiredString
  )
  postalCode!:
    string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(
    cleanOptionalString
  )
  country?:
    string;

  @IsOptional()
  @IsBoolean()
  isDefault?:
    boolean;
}
