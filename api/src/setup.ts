import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { timingSafeEqual } from "node:crypto";
import { config } from "./config";
export function setup(app: NestExpressApplication) {
  const settings = config();
  app.enableCors({
    origin: settings.origins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
    exposedHeaders: ["Content-Disposition"],
  });
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!settings.apiKey || req.method === "OPTIONS") return next();
    const supplied = Buffer.from(req.headers["x-api-key"] ?? "");
    const expected = Buffer.from(settings.apiKey);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return res
        .status(401)
        .json({ statusCode: 401, message: "Invalid API key" });
    next();
  });
  app.setGlobalPrefix("api/v1");
  app.useBodyParser("json", { limit: "1mb" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
