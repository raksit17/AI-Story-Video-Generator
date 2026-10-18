import { AiModule } from "../ai/ai.module";
import { BackgroundRemovalService } from "./background-removal.service";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VideosModule } from "../videos/videos.module";
import { MediaModule } from "../media/media.module";
import { ThumbnailsService } from "./thumbnails.service";
import { ThumbnailsController } from "./thumbnails.controller";
@Module({
  imports: [DatabaseModule, VideosModule, MediaModule, AiModule],
  controllers: [ThumbnailsController],
  providers: [ThumbnailsService, BackgroundRemovalService],
})
export class ThumbnailsModule {}
