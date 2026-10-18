import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import sharp from "sharp";
import { AssetsService } from "../media/assets.service";
import { RemoveBackgroundDto } from "../dto/remove-background.dto";
const MAX_OUTPUT = 10 * 1024 * 1024;
@Injectable()
export class BackgroundRemovalService {
  private busy = false;
  private readonly worker = (
    process.env.REMOVAL_WORKER_URL ?? "http://127.0.0.1:8001"
  ).replace(/\/$/, "");
  private readonly key = process.env.REMOVAL_WORKER_KEY ?? "";
  private readonly timeout = Math.max(
    1000,
    Math.min(600000, Number(process.env.REMOVAL_TIMEOUT_MS) || 180000),
  );
  constructor(private readonly assets: AssetsService) {}
  private headers(): Record<string, string> {
    return this.key ? { "X-Worker-Key": this.key } : {};
  }
  async health() {
    try {
      const response = await fetch(`${this.worker}/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Worker health failed");
      const body = await response.json();
      return {
        status: body.status,
        model: body.model,
        device: body.device,
        modelLoaded: body.modelLoaded,
        busy: body.busy,
        providers: body.providers,
      };
    } catch {
      throw new ServiceUnavailableException(
        "AI Worker unavailable. Start youtube-thumbnail-ai on port 8001; check REMOVAL_WORKER_KEY.",
      );
    }
  }
  private async infer(bytes: Buffer) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      "crop.png",
    );
    let response: Response;
    try {
      response = await fetch(`${this.worker}/remove-background`, {
        method: "POST",
        headers: this.headers(),
        body: form,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!response.ok) {
        if (response.status === 503)
          throw new ServiceUnavailableException(
            "AI Worker is busy or model initialization failed. Check worker logs; retry after it finishes.",
          );
        if (response.status === 401)
          throw new BadGatewayException(
            "Worker key mismatch. Match REMOVAL_WORKER_KEY with WORKER_API_KEY.",
          );
        throw new BadGatewayException(
          `AI Worker rejected the crop (HTTP ${response.status})`,
        );
      }
      if (
        !response.headers.get("content-type")?.startsWith("image/png") ||
        !response.body
      )
        throw new BadGatewayException("AI Worker must return PNG");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > MAX_OUTPUT) {
            await reader.cancel();
            throw new BadGatewayException("AI output exceeds 10 MiB");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      )
        throw error;
      if (
        (error as Error).name === "TimeoutError" ||
        (error as Error).name === "AbortError"
      )
        throw new GatewayTimeoutException(
          "AI request timed out. Worker may still be processing; wait before retrying. Warm up the model before first use.",
        );
      throw new ServiceUnavailableException(
        "Cannot reach AI Worker. Start FastAPI and check REMOVAL_WORKER_URL.",
      );
    }
  }
  async remove(videoId: string, dto: RemoveBackgroundDto) {
    if (this.busy)
      throw new ServiceUnavailableException(
        "A background removal request is running. Retry when it finishes.",
      );
    this.busy = true;
    const created: { id: string; filename: string }[] = [];
    try {
      const { asset, bytes } = await this.assets.file(dto.sourceAssetId);
      if (asset.videoId !== videoId || !["frame", "image"].includes(asset.kind))
        throw new BadRequestException(
          "Source must be a frame/image belonging to this video",
        );
      const { x, y, width, height } = dto.crop;
      const metadata = await sharp(bytes).metadata();
      if (
        x + width > (metadata.width ?? 0) ||
        y + height > (metadata.height ?? 0)
      )
        throw new BadRequestException("Crop exceeds source image boundaries");
      const crop = await sharp(bytes)
        .extract({ left: x, top: y, width, height })
        .png()
        .toBuffer();
      const output = await this.infer(crop);
      let result: sharp.Metadata;
      try {
        result = await sharp(output, { limitInputPixels: 4194304 }).metadata();
        await sharp(output, { limitInputPixels: 4194304 }).stats();
      } catch {
        throw new BadGatewayException("AI returned an invalid image");
      }
      if (
        result.format !== "png" ||
        !result.hasAlpha ||
        result.width !== width ||
        result.height !== height ||
        (result.pages ?? 1) > 1
      )
        throw new BadGatewayException(
          "AI output must be RGBA PNG with the same crop dimensions",
        );
      const file = (buffer: Buffer) => ({ buffer }) as Express.Multer.File;
      const source = await this.assets.upload(videoId, file(crop), "image");
      created.push(source);
      const cutout = await this.assets.upload(videoId, file(output), "image");
      created.push(cutout);
      return { source, cutout, crop: dto.crop, model: "isnet-anime" };
    } catch (error) {
      for (const a of created)
        await this.assets.deleteGenerated(a.id).catch(() => {});
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
