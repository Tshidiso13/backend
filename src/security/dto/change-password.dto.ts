import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?:
    string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(
    /[a-z]/,
    {
      message:
        "New password must contain at least one lowercase letter.",
    }
  )
  @Matches(
    /[A-Z]/,
    {
      message:
        "New password must contain at least one uppercase letter.",
    }
  )
  @Matches(
    /\d/,
    {
      message:
        "New password must contain at least one number.",
    }
  )
  newPassword!:
    string;
}
