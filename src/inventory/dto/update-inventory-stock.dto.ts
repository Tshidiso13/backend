import {
  IsInt,
  IsOptional,
  Min,
} from "class-validator";

export class UpdateInventoryStockDto {
  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  threshold?: number;
}
