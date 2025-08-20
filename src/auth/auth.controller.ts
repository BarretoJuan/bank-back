import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { EmailPasswordDto } from "./dto/auth.dto";
import { SupabaseAuthGuard } from "./supabase.strategy";
import { UserService } from "../user/user.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post("sign-up")
  async signUp(@Body() dto: EmailPasswordDto) {
    const res = await this.service.signUp(dto);
    if (res?.user) {
      await this.userService.ensureUser({
        id: res.user.id,
        email: res.user.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });
    }
    return res;
  }

  @HttpCode(200)
  @Post("sign-in")
  async signIn(@Body() dto: EmailPasswordDto) {
    return this.service.signIn(dto);
  }

  @UseGuards(SupabaseAuthGuard)
  @Post("sign-out")
  async signOut(@Req() req: any, @Body() body: any) {
    const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    return this.service.signOut(accessToken, body.refreshToken);
  }

  @UseGuards(SupabaseAuthGuard)
  @Get("me")
  me(@Req() req: any) {
    return req.user;
  }
}
