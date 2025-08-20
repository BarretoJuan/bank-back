import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  const config = app.get(ConfigService);
  const port = config.get("PORT") ?? 3001;

  const primaryOrigin =
    config.get<string>("FRONTEND_URL") ||
    "http://localhost:3000";


  const extraOriginsRaw = config.get<string>("CORS_EXTRA_ORIGINS");
  const extraOrigins = extraOriginsRaw
    ? extraOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

  // Always include localhost for dev convenience.
  const defaultLocalOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  // Build the unique allowlist.
  const allowList = Array.from(
    new Set([
      primaryOrigin,
      ...extraOrigins,
      ...defaultLocalOrigins,
      // Hard-code known production frontend if not already provided (Railway example)
      "https://bank-front-production.up.railway.app",
    ].filter(Boolean))
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser or same-origin requests may have no origin header.
      if (!origin) return callback(null, true);
      if (allowList.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      // Add common custom headers your frontend / auth provider might send.
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Disposition"],
  });
  await app.listen(port);
}
bootstrap();
