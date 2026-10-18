import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { AssetsService } from "./assets.service";
@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  @Get(":id/file") async file(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("download") download?: string,
  ) {
    const { asset, bytes } = await this.assets.file(id);
    return new StreamableFile(bytes, {
      type: asset.mimeType,
      length: bytes.length,
      disposition: `${download === "1" ? "attachment" : "inline"}; filename="${asset.filename}"`,
    });
  }
}
