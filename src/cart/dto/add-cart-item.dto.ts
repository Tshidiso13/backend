import {
  IsInt,
  IsString,
  Max,
  Min,
} from "class-validator";

export class AddCartItemDto {
  @IsString()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}
