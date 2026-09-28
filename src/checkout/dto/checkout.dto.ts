import {
  Type,
} from "class-transformer";

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/* =========================================================
   ENUM-LIKE CONSTANTS
========================================================= */

export const DELIVERY_METHODS = [
  "ARAMEX",
  "PAXI",
] as const;

export const PAYMENT_METHODS = [
  "PAYFAST",
  "CASH_ON_DELIVERY",
] as const;

export type DeliveryMethodInput =
  (typeof DELIVERY_METHODS)[number];

export type PaymentMethodInput =
  (typeof PAYMENT_METHODS)[number];

/* =========================================================
   CART LINE
========================================================= */

export class CheckoutLineDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @Type(
    () => Number
  )
  @IsInt()
  @Min(
    1
  )
  quantity!: number;
}

/* =========================================================
   CHECKOUT PREVIEW
========================================================= */

export class CheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(
    1
  )
  @ArrayMaxSize(
    50
  )
  @ValidateNested({
    each: true,
  })
  @Type(
    () => CheckoutLineDto
  )
  items!: CheckoutLineDto[];

  @IsIn(
    DELIVERY_METHODS
  )
  deliveryMethod!: DeliveryMethodInput;
}

/* =========================================================
   CREATE CHECKOUT
========================================================= */

export class CreateCheckoutDto extends CheckoutPreviewDto {
  /* -----------------------------
     PAYMENT
  ----------------------------- */

  @IsIn(
    PAYMENT_METHODS
  )
  paymentMethod!: PaymentMethodInput;

  /* -----------------------------
     CUSTOMER
  ----------------------------- */

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    80
  )
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    80
  )
  lastName!: string;

  @IsEmail()
  @MaxLength(
    160
  )
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^[+0-9][0-9\s()\-]{7,24}$/,
    {
      message:
        "Phone number is invalid.",
    }
  )
  phone!: string;

  /* -----------------------------
     DELIVERY ADDRESS
  ----------------------------- */

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    180
  )
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(
    120
  )
  addressExtra?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    100
  )
  suburb!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    100
  )
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    100
  )
  province!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(
    20
  )
  postalCode!: string;

  /* -----------------------------
     PAXI
  ----------------------------- */

  @IsOptional()
  @IsString()
  @MaxLength(
    80
  )
  paxiPointCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(
    180
  )
  paxiPointName?: string;
}
