import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import {
  Type,
} from "class-transformer";

export class GuestNotificationOrderRefDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  orderId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class GuestNotificationQueryDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({
    each: true,
  })
  @Type(() => GuestNotificationOrderRefDto)
  orders!: GuestNotificationOrderRefDto[];
}
