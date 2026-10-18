import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MediaModule } from "../media/media.module";
import { VideosModule } from "../videos/videos.module";
import { AiController } from "./ai.controller";
import { AiGenerationService } from "./ai-generation.service";
import { ComfyUiService } from "./comfyui.service";
@Module({
  imports: [DatabaseModule, MediaModule, VideosModule],
  controllers: [AiController],
  providers: [ComfyUiService, AiGenerationService],
})
export class AiModule {}
