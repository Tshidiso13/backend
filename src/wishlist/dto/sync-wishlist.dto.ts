import {
  ArrayMaxSize,
  IsArray,
  IsString,
} from "class-validator";

export class SyncWishlistDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({
    each: true,
  })
  productIds!: string[];
}
