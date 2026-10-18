import { BackgroundRemovalService } from "./background-removal.service";
import { RemoveBackgroundDto } from "../dto/remove-background.dto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DraftDto, FramesDto, UpdateDraftDto } from "../dto/thumbnail.dto";
import { ThumbnailsService } from "./thumbnails.service";
import { AssetsService } from "../media/assets.service";
import { VideosService } from "../videos/videos.service";
const uploadOptions = {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
};
function offset(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new BadRequestException("offset must be a non-negative integer");
  return n;
}
@Controller("videos/:videoId/thumbnails")
export class ThumbnailsController {
  constructor(
    private readonly thumbnails: ThumbnailsService,
    private readonly removal: BackgroundRemovalService,
    private readonly assets: AssetsService,
    private readonly videos: VideosService,
  ) {}
  @Get("background-removal/health") workerHealth() {
    return this.removal.health();
  }
  @Post("remove-background") removeBackground(
    @Param("videoId") videoId: string,
    @Body() dto: RemoveBackgroundDto,
  ) {
    return this.removal.remove(videoId, dto);
  }
  @Post("frames") frames(
    @Param("videoId") videoId: string,
    @Body() dto: FramesDto,
  ) {
    return this.thumbnails.frames(videoId, dto.timestampsMs);
  }
  @Get("frames") framesList(
    @Param("videoId") videoId: string,
    @Query("offset") page = "0",
  ) {
    return this.assets.list(videoId, "frame", offset(page));
  }
  @Post("images")
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async upload(
    @Param("videoId") videoId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.videos.find(videoId);
    return this.assets.upload(videoId, file, "image");
  }
  @Get("images") images(
    @Param("videoId") videoId: string,
    @Query("offset") page = "0",
  ) {
    return this.assets.list(videoId, "image", offset(page));
  }
  @Post("exports")
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async export(
    @Param("videoId") videoId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.videos.find(videoId);
    return this.assets.upload(videoId, file, "export");
  }
  @Get("exports") exports(
    @Param("videoId") videoId: string,
    @Query("offset") page = "0",
  ) {
    return this.assets.list(videoId, "export", offset(page));
  }
  @Post("drafts") create(
    @Param("videoId") videoId: string,
    @Body() dto: DraftDto,
  ) {
    return this.thumbnails.create(videoId, dto);
  }
  @Get("drafts") list(
    @Param("videoId") videoId: string,
    @Query("offset") page = "0",
  ) {
    return this.thumbnails.list(videoId, offset(page));
  }
  @Get("drafts/:id") get(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.thumbnails.get(videoId, id);
  }
  @Put("drafts/:id") update(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.thumbnails.update(videoId, id, dto);
  }
  @Delete("drafts/:id") delete(
    @Param("videoId") videoId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("revision") revision: string,
  ) {
    const n = Number(revision);
    if (!Number.isSafeInteger(n) || n < 1)
      throw new BadRequestException("revision is required");
    return this.thumbnails.delete(videoId, id, n);
  }
}
