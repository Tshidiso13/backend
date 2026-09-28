import { Type } from "class-transformer";

import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class AdminProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([
    "DRAFT",
    "ACTIVE",
    "ARCHIVED",
  ])
  status?:
    | "DRAFT"
    | "ACTIVE"
    | "ARCHIVED";

  @IsOptional()
  @IsIn([
    "WOMEN",
    "MEN",
    "UNISEX",
  ])
  audience?:
    | "WOMEN"
    | "MEN"
    | "UNISEX";

  @IsOptional()
  @IsString()
  family?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export const PUBLIC_SCENT_MOODS = [
  "fresh",
  "warm",
  "dark",
  "soft",
] as const;

export type PublicScentMood =
  (typeof PUBLIC_SCENT_MOODS)[number];

export class PublicProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  family?: string;

  @IsOptional()
  @IsIn([
    "WOMEN",
    "MEN",
    "UNISEX",
  ])
  audience?:
    | "WOMEN"
    | "MEN"
    | "UNISEX";

  @IsOptional()
  @IsIn(
    PUBLIC_SCENT_MOODS
  )
  mood?: PublicScentMood;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

