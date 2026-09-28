import {
  Type,
} from "class-transformer";

import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

class SyncCartItemDto {
  @IsString()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class SyncCartDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      SyncCartItemDto
  )
  items!: SyncCartItemDto[];
}
