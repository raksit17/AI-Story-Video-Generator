import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { config } from "./config";
import { setup } from "./setup";
async function bootstrap() {
  const settings = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  setup(app);
  const docs = new DocumentBuilder()
    .setTitle("YouTube Thumbnail API")
    .setVersion("1.0")
    .addApiKey({ type: "apiKey", in: "header", name: "X-API-Key" })
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, docs));
  await app.listen(settings.port, settings.host);
  console.log(`Thumbnail API: http://${settings.host}:${settings.port}/api/v1`);
}
bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
