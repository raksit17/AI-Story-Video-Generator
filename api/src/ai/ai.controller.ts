import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AiGenerationService } from "./ai-generation.service";
import { ComfyUiService } from "./comfyui.service";
import { GenerateBackgroundDto } from "./ai.dto";
@Controller("videos/:videoId/thumbnails/ai-backgrounds")
export class AiController {
  constructor(
    private jobs: AiGenerationService,
    private comfy: ComfyUiService,
  ) {}
  @Get("health") async health() {
    try {
      return await this.comfy.health();
    } catch {
      throw new ServiceUnavailableException(
        "Cannot reach ComfyUI. Start it on port 8188 and check COMFYUI_URL.",
      );
    }
  }
  @Post() @HttpCode(202) create(
    @Param("videoId") videoId: string,
    @Body() input: GenerateBackgroundDto,
  ) {
    return this.jobs.create(videoId, input);
  }
  @Get() list(@Param("videoId") videoId: string) {
    return this.jobs.list(videoId);
  }
  @Get(":id") get(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.jobs.get(videoId, id);
  }
  @Get(":id/images") async images(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return { items: (await this.jobs.get(videoId, id)).state.assets };
  }
  @Post(":id/cancel") cancel(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.jobs.cancel(videoId, id);
  }
}
