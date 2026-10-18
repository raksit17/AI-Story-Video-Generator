import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config";
import { DatabaseService } from "../database/database.service";
export interface Asset {
  id: string;
  videoId: string;
  kind: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  timestampMs: number | null;
  sizeBytes: number;
}
@Injectable()
export class AssetsService {
  private readonly directory = join(config().storageDir, "assets");
  constructor(private readonly db: DatabaseService) {}
  async allocate(extension: "jpg" | "png") {
    await mkdir(this.directory, { recursive: true });
    const id = randomUUID(),
      filename = `${id}.${extension}`;
    return { id, filename, path: join(this.directory, filename) };
  }
  response(asset: Asset) {
    return { ...asset, url: `/api/v1/assets/${asset.id}/file` };
  }
  async insert(asset: Asset) {
    const { rows } = await this.db.query<Asset>(
      `INSERT INTO thumbnail_editor.assets (id,"videoId",kind,filename,"mimeType",width,height,"timestampMs","sizeBytes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        asset.id,
        asset.videoId,
        asset.kind,
        asset.filename,
        asset.mimeType,
        asset.width,
        asset.height,
        asset.timestampMs,
        asset.sizeBytes,
      ],
    );
    return this.response(rows[0]);
  }
  async list(videoId: string, kind: string, offset: number) {
    const { rows } = await this.db.query<Asset>(
      `SELECT * FROM thumbnail_editor.assets WHERE "videoId"=$1 AND kind=$2 ORDER BY "createdAt" DESC, id DESC LIMIT 51 OFFSET $3`,
      [videoId, kind, offset],
    );
    return {
      items: rows.slice(0, 50).map((a) => this.response(a)),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async get(id: string) {
    const { rows } = await this.db.query<Asset>(
      "SELECT * FROM thumbnail_editor.assets WHERE id=$1",
      [id],
    );
    if (!rows[0]) throw new NotFoundException("Asset not found");
    return rows[0];
  }
  async file(id: string) {
    const asset = await this.get(id);
    if (!/^[a-f0-9-]+\.(jpg|png)$/.test(asset.filename))
      throw new NotFoundException("Invalid stored filename");
    const bytes = await readFile(join(this.directory, asset.filename)).catch(
      () => {
        throw new NotFoundException("Asset file missing");
      },
    );
    return { asset, bytes };
  }
  async removeFile(path: string) {
    await unlink(path).catch(() => {});
  }
  async rollback(id: string, path: string) {
    await this.db.query("DELETE FROM thumbnail_editor.assets WHERE id=$1", [
      id,
    ]);
    await this.removeFile(path);
  }
  async deleteGenerated(id: string) {
    const asset = await this.get(id);
    if (!/^[a-f0-9-]+\.(jpg|png)$/.test(asset.filename))
      throw new NotFoundException("Invalid generated filename");
    await this.rollback(id, join(this.directory, asset.filename));
  }
  async upload(
    videoId: string,
    file: Express.Multer.File | undefined,
    kind: "image" | "export",
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException(
        "Provide PNG or JPEG in multipart field file",
      );
    let bytes: Buffer,
      width: number,
      height: number,
      mimeType: string,
      ext: "jpg" | "png";
    try {
      const metadata = await sharp(file.buffer, {
        limitInputPixels: 24000000,
      }).metadata();
      if (
        !["png", "jpeg"].includes(metadata.format ?? "") ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error("format");
      const pipeline = sharp(file.buffer, {
        limitInputPixels: 24000000,
      }).rotate();
      ext = metadata.format === "jpeg" ? "jpg" : "png";
      const result = await (
        ext === "jpg" ? pipeline.jpeg({ quality: 95 }) : pipeline.png()
      ).toBuffer({ resolveWithObject: true });
      bytes = result.data;
      width = result.info.width;
      height = result.info.height;
      mimeType = ext === "jpg" ? "image/jpeg" : "image/png";
    } catch {
      throw new BadRequestException(
        "Invalid image. Only single-frame PNG/JPEG up to 24 megapixels are accepted.",
      );
    }
    if (kind === "export" && (width !== 1280 || height !== 720))
      throw new BadRequestException("Export must be exactly 1280 × 720 pixels");
    const location = await this.allocate(ext);
    try {
      await writeFile(location.path, bytes, { flag: "wx" });
      return await this.insert({
        id: location.id,
        filename: location.filename,
        videoId,
        kind,
        mimeType,
        width,
        height,
        timestampMs: null,
        sizeBytes: bytes.length,
      });
    } catch (error) {
      await this.removeFile(location.path);
      throw error;
    }
  }
}
