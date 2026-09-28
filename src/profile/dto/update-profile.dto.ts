import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import {
  Transform,
} from "class-transformer";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
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
  name?:
    string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(
    ({
      value,
    }) =>
      typeof value ===
      "string"
        ? value
            .trim()
            .toLowerCase()
        : value
  )
  email?:
    string;
}
