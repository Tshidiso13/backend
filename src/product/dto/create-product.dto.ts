import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import {
  SCENT_MOOD_VALUES,
  SCENT_OCCASION_VALUES,
  SCENT_PERSONALITY_VALUES,
  type ScentMoodInput,
  type ScentOccasionInput,
  type ScentPersonalityInput,
} from "./scent-profile.constants";

import { Type } from "class-transformer";

import {
  ProductImageDto,
} from "./product-image.dto";

/* =========================================================
   CONSTANTS
========================================================= */

export const PRODUCT_AUDIENCES = [
  "Women",
  "Men",
  "Unisex",
] as const;

export const PRODUCT_STATUSES = [
  "Draft",
  "Active",
] as const;

/* =========================================================
   TYPES
========================================================= */

export type ProductAudienceInput =
  (typeof PRODUCT_AUDIENCES)[number];

export type ProductStatusInput =
  (typeof PRODUCT_STATUSES)[number];

/* =========================================================
   VARIANT
========================================================= */

export class CreateProductVariantDto {
  /*
   * Used by the edit page.
   * Omitted during initial creation.
   */
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  size!: string;

  /*
   * Examples:
   * "1450"
   * "1299.99"
   */
  @IsString()
  @Matches(
    /^\d+(\.\d{1,2})?$/,
    {
      message:
        "Variant price must be a valid positive amount.",
    }
  )
  price!: string;

  /*
   * Frontend sends stock as a string.
   */
  @IsString()
  @Matches(
    /^\d+$/,
    {
      message:
        "Variant stock must be a whole number.",
    }
  )
  stock!: string;

  /*
   * Optional because Nest generates
   * one when the administrator leaves
   * the SKU blank.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;
}

/* =========================================================
   NOTES
========================================================= */

export class ProductNotesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({
    each: true,
  })
  top!: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({
    each: true,
  })
  heart!: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({
    each: true,
  })
  base!: string[];
}

/* =========================================================
   CREATE PRODUCT
========================================================= */

export class CreateProductDto {
  /* =======================================================
     BASIC INFORMATION
  ======================================================== */

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(SCENT_OCCASION_VALUES, {
    each: true,
  })
  scentOccasions!: ScentOccasionInput[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(SCENT_MOOD_VALUES, {
    each: true,
  })
  scentMoods!: ScentMoodInput[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(SCENT_PERSONALITY_VALUES, {
    each: true,
  })
  scentPersonalities!: ScentPersonalityInput[];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  slug!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  shortDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  story?: string;

  /* =======================================================
     FRAGRANCE INFORMATION
  ======================================================== */

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  family!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  concentration!: string;

  @IsIn(
    PRODUCT_AUDIENCES
  )
  audience!: ProductAudienceInput;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  badge?: string;

  @IsIn(
    PRODUCT_STATUSES
  )
  status!: ProductStatusInput;

  /* =======================================================
     CHARACTER
  ======================================================== */

  @IsOptional()
  @IsString()
  @MaxLength(120)
  feeling?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  longevity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sillage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  season?: string;

  /* =======================================================
     SEO
  ======================================================== */

  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  seoDescription?: string;

  /* =======================================================
     PRODUCT IMAGES

     Each image now contains:
     {
       publicId: "...",
       url: "https://res.cloudinary.com/..."
     }

     This replaces the old string[] system.
  ======================================================== */

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      ProductImageDto
  )
  images?: ProductImageDto[];

  /* =======================================================
     VARIANTS
  ======================================================== */

  @IsArray()
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      CreateProductVariantDto
  )
  variants!: CreateProductVariantDto[];

  /* =======================================================
     NOTES
  ======================================================== */

  @ValidateNested()
  @Type(
    () =>
      ProductNotesDto
  )
  notes!: ProductNotesDto;
}