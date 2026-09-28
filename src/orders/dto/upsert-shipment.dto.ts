import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

export class UpsertShipmentDto {
  @IsIn([
    "ARAMEX",
    "PAXI",
  ])
  provider!:
    "ARAMEX" |
    "PAXI";

  @IsString()
  @MaxLength(120)
  service!:
    string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  collectionPointCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  collectionPointName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(500)
  trackingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalShipmentId?: string;
}
