import {
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import {
  Transform,
} from "class-transformer";

export class ReplySupportTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  @Transform(
    ({
      value,
    }) =>
      typeof value ===
      "string"
        ? value.trim()
        : value
  )
  message!:
    string;
}
