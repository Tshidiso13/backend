import {
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

export class ProductImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  publicId!: string;

  @IsString()
  @IsUrl({
    protocols: ["https"],
    require_protocol: true,
  })
  @MaxLength(2000)
  url!: string;
}