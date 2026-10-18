import { Controller, Get, Module } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";
import { DatabaseModule } from "./database/database.module";
import { VideosModule } from "./videos/videos.module";
import { MediaModule } from "./media/media.module";
import { ThumbnailsModule } from "./thumbnails/thumbnails.module";
@Controller("health")
class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get() async get() {
    await this.db.query("SELECT id FROM thumbnail_editor.drafts LIMIT 0");
    return { status: "ok", service: "youtube-thumbnail-api" };
  }
}
@Module({
  imports: [DatabaseModule, VideosModule, MediaModule, ThumbnailsModule],
  controllers: [HealthController],
})
export class AppModule {}
