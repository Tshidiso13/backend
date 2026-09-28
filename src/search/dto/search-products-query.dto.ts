import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  Type,
} from "class-transformer";

export const SEARCH_AUDIENCES = [
  "WOMEN",
  "MEN",
  "UNISEX",
] as const;

export const SEARCH_SORTS = [
  "recommended",
  "price-low",
  "price-high",
  "name",
] as const;

export type SearchAudience =
  (typeof SEARCH_AUDIENCES)[number];

export type SearchSort =
  (typeof SEARCH_SORTS)[number];

export class SearchProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  family?: string;

  @IsOptional()
  @IsIn(SEARCH_AUDIENCES)
  audience?: SearchAudience;

  @IsOptional()
  @IsIn(SEARCH_SORTS)
  sort: SearchSort =
    "recommended";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number =
    60;
}
