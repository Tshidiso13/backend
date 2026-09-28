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

export const ADMIN_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PROCESSING",
  "PACKING",
  "READY_FOR_SHIPMENT",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED",
] as const;

export const ADMIN_PAYMENT_STATUSES = [
  "PENDING",
  "COMPLETE",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export const ADMIN_DELIVERY_METHODS = [
  "ARAMEX",
  "PAXI",
] as const;

export const ADMIN_CUSTOMER_TYPES = [
  "ACCOUNT",
  "GUEST",
] as const;

export class AdminOrderQueryDto {
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
  limit = 25;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_ORDER_STATUSES)
  orderStatus?: (typeof ADMIN_ORDER_STATUSES)[number];

  @IsOptional()
  @IsIn(ADMIN_PAYMENT_STATUSES)
  paymentStatus?: (typeof ADMIN_PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(ADMIN_DELIVERY_METHODS)
  deliveryMethod?: (typeof ADMIN_DELIVERY_METHODS)[number];

  @IsOptional()
  @IsIn(ADMIN_CUSTOMER_TYPES)
  customerType?: (typeof ADMIN_CUSTOMER_TYPES)[number];
}
