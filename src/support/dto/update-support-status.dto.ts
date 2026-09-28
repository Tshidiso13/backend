import {
  IsEnum,
} from "class-validator";

export enum SupportStatusDto {
  OPEN =
    "OPEN",
  IN_PROGRESS =
    "IN_PROGRESS",
  WAITING_FOR_CUSTOMER =
    "WAITING_FOR_CUSTOMER",
  RESOLVED =
    "RESOLVED",
  CLOSED =
    "CLOSED",
}

export class UpdateSupportStatusDto {
  @IsEnum(
    SupportStatusDto
  )
  status!:
    SupportStatusDto;
}
