import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { VideosService } from "../videos/videos.service";
import { AssetsService } from "../media/assets.service";
import { FrameExtractorService } from "../media/frame-extractor.service";
import { DraftDto, UpdateDraftDto } from "../dto/thumbnail.dto";
@Injectable()
export class ThumbnailsService {
  private extracting = false;
  constructor(
    private readonly db: DatabaseService,
    private readonly videos: VideosService,
    private readonly assets: AssetsService,
    private readonly extractor: FrameExtractorService,
  ) {}
  async frames(videoId: string, timestamps: number[]) {
    if (this.extracting)
      throw new ServiceUnavailableException(
        "Frame extraction is busy. Retry after the current request completes.",
      );
    this.extracting = true;
    const created: { id: string; path: string }[] = [];
    try {
      const video = await this.videos.find(videoId);
      const source = await this.extractor.source(video);
      const duration = await this.extractor.duration(source);
      const unique = [...new Set(timestamps)].sort((a, b) => a - b);
      if (unique.some((t) => t >= duration))
        throw new BadRequestException(
          `timestampsMs must be less than source duration (${Math.floor(duration)} ms)`,
        );
      const items = [];
      for (const timestampMs of unique) {
        const location = await this.assets.allocate("jpg");
        created.push(location);
        const sizeBytes = await this.extractor.extract(
          source,
          timestampMs,
          location.path,
        );
        items.push(
          await this.assets.insert({
            id: location.id,
            filename: location.filename,
            videoId,
            kind: "frame",
            mimeType: "image/jpeg",
            width: 1280,
            height: 720,
            timestampMs,
            sizeBytes,
          }),
        );
      }
      return {
        items,
        sourceDurationMs: Math.floor(duration),
        timeBase: "source-video",
      };
    } catch (error) {
      for (const item of created)
        await this.assets.rollback(item.id, item.path).catch(() => {});
      throw error;
    } finally {
      this.extracting = false;
    }
  }
  private async validateDocument(videoId: string, dto: DraftDto) {
    if (!dto.document) throw new BadRequestException("document is required");
    const elements = dto.document.elements;
    if (new Set(elements.map((e) => e.id)).size !== elements.length)
      throw new BadRequestException("Element IDs must be unique");
    for (const el of elements) {
      if (el.type === "text" && typeof el.text !== "string")
        throw new BadRequestException("Text elements require text");
      if (el.type === "image" && !el.assetId)
        throw new BadRequestException("Image elements require assetId");
    }
    const ids = [
      ...new Set(
        [
          dto.document.backgroundAssetId,
          ...elements.filter((e) => e.type === "image").map((e) => e.assetId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    for (const id of ids) {
      const asset = await this.assets.get(id);
      if (asset.videoId !== videoId || asset.kind === "export")
        throw new BadRequestException(
          "Draft assets must be frames/images belonging to the same video",
        );
    }
  }
  async create(videoId: string, dto: DraftDto) {
    await this.videos.find(videoId);
    await this.validateDocument(videoId, dto);
    return (
      await this.db.query(
        `INSERT INTO thumbnail_editor.drafts (id,"videoId",name,document) VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
        [randomUUID(), videoId, dto.name, JSON.stringify(dto.document)],
      )
    ).rows[0];
  }
  async list(videoId: string, offset: number) {
    const { rows } = await this.db.query(
      `SELECT id,"videoId",name,revision,"createdAt","updatedAt" FROM thumbnail_editor.drafts WHERE "videoId"=$1 ORDER BY "updatedAt" DESC, id DESC LIMIT 51 OFFSET $2`,
      [videoId, offset],
    );
    return {
      items: rows.slice(0, 50),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async get(videoId: string, id: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM thumbnail_editor.drafts WHERE id=$1 AND "videoId"=$2',
      [id, videoId],
    );
    if (!rows[0]) throw new NotFoundException("Draft not found");
    return rows[0];
  }
  async update(videoId: string, id: string, dto: UpdateDraftDto) {
    await this.get(videoId, id);
    await this.validateDocument(videoId, dto);
    const { rows } = await this.db.query(
      `UPDATE thumbnail_editor.drafts SET name=$1,document=$2::jsonb,revision=revision+1,"updatedAt"=now() WHERE id=$3 AND "videoId"=$4 AND revision=$5 RETURNING *`,
      [dto.name, JSON.stringify(dto.document), id, videoId, dto.revision],
    );
    if (!rows[0])
      throw new ConflictException("Draft has changed. Reload before saving.");
    return rows[0];
  }
  async delete(videoId: string, id: string, revision: number) {
    await this.get(videoId, id);
    const { rowCount } = await this.db.query(
      'DELETE FROM thumbnail_editor.drafts WHERE id=$1 AND "videoId"=$2 AND revision=$3',
      [id, videoId, revision],
    );
    if (!rowCount)
      throw new ConflictException("Draft has changed. Reload before deleting.");
    return { deleted: true };
  }
}
