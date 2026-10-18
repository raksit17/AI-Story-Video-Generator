import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { DatabaseService } from "../database/database.service";
import { LocalVideoDto } from "../dto/thumbnail.dto";
export interface Video {
  id: string;
  externalId: string;
  title: string;
  durationMs: number | null;
}
@Injectable()
export class VideosService implements OnModuleDestroy {
  private readonly settings = config();
  private readonly sourceDb =
    this.settings.mode === "database"
      ? new Pool({
          connectionString: this.settings.highlightDatabaseUrl,
          max: 2,
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000,
          options: "-c default_transaction_read_only=on",
        })
      : undefined;
  constructor(private readonly db: DatabaseService) {}
  private async request(path: string) {
    try {
      const response = await fetch(`${this.settings.highlightApiUrl}${path}`, {
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (response.status === 404)
        throw new NotFoundException("Video not found in highlight API");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadGatewayException(
        "Cannot read highlight API. Check HIGHLIGHT_API_URL and start youtube-highlight-api.",
      );
    }
  }
  async list(limit: number, offset: number, cursor?: string) {
    if (this.settings.mode === "api")
      return this.request(
        `/videos?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
    const table = this.sourceDb
      ? "public.videos"
      : "thumbnail_editor.local_videos";
    const { rows } = await this.catalogQuery(
      `SELECT id, "externalId", title, "durationMs" FROM ${table} ORDER BY "createdAt" DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit + 1, offset],
    );
    return {
      items: rows.slice(0, limit),
      nextOffset: rows.length > limit ? offset + limit : null,
    };
  }
  async find(id: string): Promise<Video> {
    if (this.settings.mode === "api") {
      const video = await this.request(`/videos/${encodeURIComponent(id)}`);
      if (!video || video.id !== id || typeof video.externalId !== "string")
        throw new BadGatewayException(
          "Invalid video response from highlight API",
        );
      return video;
    }
    const table = this.sourceDb
      ? "public.videos"
      : "thumbnail_editor.local_videos";
    const { rows } = await this.catalogQuery(
      `SELECT id, "externalId", title, "durationMs" FROM ${table} WHERE id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("Video not found");
    return rows[0];
  }
  private catalogQuery(sql: string, values: unknown[]) {
    return this.sourceDb
      ? this.sourceDb.query<Video>(sql, values)
      : this.db.query<Video>(sql, values);
  }
  async register(dto: LocalVideoDto) {
    if (this.settings.mode !== "local")
      throw new ConflictException(
        "Registration requires VIDEO_CATALOG_MODE=local",
      );
    try {
      return (
        await this.db.query(
          `INSERT INTO thumbnail_editor.local_videos (id,"externalId",title) VALUES ($1,$2,$3) RETURNING *`,
          [randomUUID(), dto.externalId, dto.title],
        )
      ).rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("externalId already registered");
      throw error;
    }
  }
  async onModuleDestroy() {
    await this.sourceDb?.end();
  }
}
