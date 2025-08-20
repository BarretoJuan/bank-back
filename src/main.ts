import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    origin: [`http://localhost:${app.get(ConfigService).get("PORT") ?? 3000}`],
    credentials: true,
  });
  await app.listen(app.get(ConfigService).get("PORT") ?? 3000);
}
bootstrap();
