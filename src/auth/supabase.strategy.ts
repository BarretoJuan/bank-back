import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
// Use dynamic import for 'jose' to avoid CommonJS require() issues in deployment (Railway Node 18 -> 20)
// This keeps local dev working while ensuring ESM module is loaded correctly.
let createRemoteJWKSet: any; // typed lazily to avoid top-level ESM import problems
let jwtVerify: any;

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
      // Lazy-load jose functions if not already loaded (handles ESM in CJS runtime)
      if (!createRemoteJWKSet || !jwtVerify) {
        const mod = await import("jose");
        createRemoteJWKSet = mod.createRemoteJWKSet;
        jwtVerify = mod.jwtVerify;
      }

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
