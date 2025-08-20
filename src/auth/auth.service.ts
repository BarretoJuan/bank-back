import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON } from "../supabase/supabase.module";
import { EmailPasswordDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(@Inject(SUPABASE_ANON) private readonly sb: SupabaseClient) {}

  async signUp(dto: EmailPasswordDto) {
    const { data, error } = await this.sb.auth.signUp({
      email: dto.email,
      password: dto.password,
    });
    if (error) throw new UnauthorizedException(error.message);
    return data;
  }

  async signIn(dto: EmailPasswordDto) {
    const { data, error } = await this.sb.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (error) throw new UnauthorizedException(error.message);
    return {
      user: data.user,
      accessToken: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
      expiresAt: data.session?.expires_at,
    };
  }

  async signOut(accessToken: string, refreshToken: string) {
    if (!accessToken || !refreshToken) {
      throw new UnauthorizedException(
        "Both access and refresh tokens are required",
      );
    }

    try {
      const { createClient } = require("@supabase/supabase-js");
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;

      const sessionClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });

      const { error: sessionError } = await sessionClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error("Session error:", sessionError);
        throw new UnauthorizedException(
          `Session error: ${sessionError.message}`,
        );
      }

      const { error: signOutError } = await sessionClient.auth.signOut();

      if (signOutError) {
        console.error("Sign out error:", signOutError);
        throw new UnauthorizedException(
          `Sign out error: ${signOutError.message}`,
        );
      }

      return { success: true, message: "Signed out successfully" };
    } catch (error) {
      console.error("Unexpected error during sign out:", error);
      throw new UnauthorizedException(`Unexpected error: ${error.message}`);
    }
  }
}
