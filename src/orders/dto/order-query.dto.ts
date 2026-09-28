import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

import {
  Type,
} from "class-transformer";

export const CUSTOMER_ORDER_STATUSES = [
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

export type CustomerOrderStatus =
  (typeof CUSTOMER_ORDER_STATUSES)[number];

export class OrderQueryDto {
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
  limit = 12;

  @IsOptional()
  @IsIn(CUSTOMER_ORDER_STATUSES)
  status?: CustomerOrderStatus;
}
