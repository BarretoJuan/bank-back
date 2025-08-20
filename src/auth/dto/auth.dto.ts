import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class EmailPasswordDto {
  @IsEmail() email: string;
  @IsString()
  @MinLength(8)
  @Matches(/\d/, { message: "password must include at least one number" })
  password: string;

  firstName: string;

  lastName: string;
}
