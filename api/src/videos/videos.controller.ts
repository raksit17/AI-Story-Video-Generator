import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { VideosService } from "./videos.service";
import { LocalVideoDto } from "../dto/thumbnail.dto";
@Controller("videos")
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @Get() list(
    @Query("limit") rawLimit = "20",
    @Query("offset") rawOffset = "0",
    @Query("cursor") cursor?: string,
  ) {
    const limit = Number(rawLimit),
      offset = Number(rawOffset);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      throw new BadRequestException(
        "limit: 1..100; offset: non-negative integer",
      );
    return this.videos.list(limit, offset, cursor);
  }
  @Get(":id") find(@Param("id") id: string) {
    return this.videos.find(id);
  }
  @Post() register(@Body() dto: LocalVideoDto) {
    return this.videos.register(dto);
  }
}
