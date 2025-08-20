import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const rawAuth = req.headers["authorization"];
    let token = (Array.isArray(rawAuth) ? rawAuth[0] : rawAuth) ?? "";
    token = token.replace(/^Bearer\s+/i, "").trim();
    token = token.replace(/^['"](.+)['"]$/, "$1");

    if (!token) throw new UnauthorizedException("Missing Bearer token");

    try {
      const jwksUrl = this.configService.get<string>("SUPABASE_JWKS_URL");
      if (!jwksUrl) {
        throw new Error("SUPABASE_JWKS_URL is not configured");
      }
      const issuer = `${this.configService.get<string>("SUPABASE_URL")}/auth/v1`;

      const JWKS = createRemoteJWKSet(new URL(jwksUrl));

      const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
        algorithms: ["RS256", "ES256"],
        issuer,
        audience: "authenticated",
      });

      req.user = {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      return true;
    } catch (e: any) {
      console.error("JWT verify error:", e?.code || e?.name, e?.message);
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
