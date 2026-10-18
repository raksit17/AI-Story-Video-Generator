import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Put,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { StoriesService } from "./stories.service";

@Controller("stories")
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Get("providers") providers() {
    return this.stories.providers();
  }

  @Get("youtube/status") youtubeStatus() { return this.stories.youtubeStatus(); }

  @Get("youtube/connect") youtubeConnect() { return this.stories.youtubeConnectUrl(); }

  @Get("youtube/callback") async youtubeCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response,
  ) {
    await this.stories.youtubeCallback(code, state);
    response.redirect(process.env.YOUTUBE_SUCCESS_REDIRECT ?? "http://127.0.0.1:5173/?youtube=connected");
  }

  @Post("storyboard") storyboard(@Body() body: Record<string, unknown>) {
    return this.stories.generateStoryboard(body);
  }

  @Get() list() {
    return this.stories.list();
  }

  @Post() create(@Body() body: Record<string, unknown>) {
    return this.stories.save(body);
  }

  @Get(":id") async get(@Param("id") id: string) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return story;
  }

  @Put(":id") async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!(await this.stories.get(id))) throw new NotFoundException("Story not found");
    return this.stories.save(body, id);
  }

  @Post(":id/scenes/:sceneId/image")
  async generateImage(
    @Param("id") id: string,
    @Param("sceneId") sceneId: string,
  ) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    const scene = (story.scenes as Array<Record<string, unknown>>)?.find(
      (item) => item.id === sceneId,
    );
    if (!scene || typeof scene.imagePrompt !== "string")
      throw new BadRequestException("Scene image prompt is required");
    const characters = Array.isArray(story.characters) ? story.characters as Array<Record<string, unknown>> : [];
    const guide = characters.map((item) => `${String(item.name ?? "Character")}: ${String(item.description ?? item.appearance ?? "")}`).join("; ");
    return this.stories.generateImage(id, sceneId, `${scene.imagePrompt}${guide ? `. Character guide: ${guide}` : ""}`);
  }

  @Post(":id/scenes/:sceneId/voice")
  async generateVoice(
    @Param("id") id: string,
    @Param("sceneId") sceneId: string,
    @Body() body: { voice?: string },
  ) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return this.stories.generateVoice(story, sceneId, body.voice);
  }

  @Post(":id/render")
  async render(@Param("id") id: string) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return this.stories.render(story);
  }

  @Post(":id/thumbnail") async setThumbnail(
    @Param("id") id: string,
    @Body() body: { dataUrl?: string },
  ) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return this.stories.saveThumbnail(story, body.dataUrl ?? "");
  }

  @Post(":id/music") async setMusic(
    @Param("id") id: string,
    @Body() body: { dataUrl?: string },
  ) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return this.stories.saveMusic(story, body.dataUrl ?? "");
  }

  @Post(":id/youtube/upload") async youtubeUpload(
    @Param("id") id: string,
    @Body() body: { privacy?: string },
  ) {
    const story = await this.stories.get(id);
    if (!story) throw new NotFoundException("Story not found");
    return this.stories.uploadYoutube(story, body.privacy ?? "private");
  }

  @Get("assets/:file") async asset(@Param("file") file: string) {
    const path = this.stories.assetPath(file);
    if (!path) throw new NotFoundException("Asset not found");
    try {
      await this.stories.assertAsset(path);
    } catch {
      throw new NotFoundException("Asset not found");
    }
    return new StreamableFile(createReadStream(path), { type: this.stories.assetContentType(file) });
  }
}
