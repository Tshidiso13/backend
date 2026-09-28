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

function cleanRequiredPatchString({
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

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(
    cleanOptionalString
  )
  label?:
    string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredPatchString
  )
  recipientName?:
    string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(30)
  @Transform(
    cleanRequiredPatchString
  )
  phone?:
    string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Transform(
    cleanRequiredPatchString
  )
  addressLine1?:
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

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredPatchString
  )
  city?:
    string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(
    cleanRequiredPatchString
  )
  province?:
    string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Transform(
    cleanRequiredPatchString
  )
  postalCode?:
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
