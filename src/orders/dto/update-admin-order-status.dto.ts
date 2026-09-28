import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

import {
  ADMIN_ORDER_STATUSES,
} from "./admin-order-query.dto";

export class UpdateAdminOrderStatusDto {
  @IsIn(ADMIN_ORDER_STATUSES)
  orderStatus!:
    (typeof ADMIN_ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
