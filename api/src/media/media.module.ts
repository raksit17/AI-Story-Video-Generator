import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AssetsService } from "./assets.service";
import { AssetsController } from "./assets.controller";
import { FrameExtractorService } from "./frame-extractor.service";
@Module({
  imports: [DatabaseModule],
  controllers: [AssetsController],
  providers: [AssetsService, FrameExtractorService],
  exports: [AssetsService, FrameExtractorService],
})
export class MediaModule {}
