import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { config } from "../config";
import { Video } from "../videos/videos.service";
@Injectable()
export class FrameExtractorService {
  private readonly settings = config();
  async source(video: Video) {
    const root = await realpath(this.settings.sourceDir).catch(() => {
      throw new NotFoundException("VIDEO_SOURCE_DIR does not exist");
    });
    for (const name of [video.externalId, video.id]) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) continue;
      for (const ext of [".mp4", ".webm", ".mkv", ".mov", ".m4v"]) {
        const path = await realpath(join(root, name + ext)).catch(() => null);
        if (!path) continue;
        const rel = relative(root, path);
        if (rel.startsWith("..") || isAbsolute(rel)) continue;
        if ((await stat(path)).isFile()) return path;
      }
    }
    throw new NotFoundException(
      "Source video not found. Put <externalId>.mp4 or <videoId>.mp4 in VIDEO_SOURCE_DIR.",
    );
  }
  private run(
    binary: string,
    args: string[],
    timeout = 60000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { windowsHide: true, shell: false });
      let out = "",
        stderr = "",
        timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);
      child.stdout.on("data", (chunk) => {
        out = (out + chunk).slice(-65536);
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-8192);
      });
      child.once("error", () => {
        clearTimeout(timer);
        reject(
          new ServiceUnavailableException(
            "Cannot start FFmpeg/FFprobe. Check FFMPEG_PATH and FFPROBE_PATH.",
          ),
        );
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (timedOut)
          return reject(
            new ServiceUnavailableException("Video processing timed out"),
          );
        if (code !== 0)
          return reject(
            new BadRequestException(
              `Video processing failed${stderr.includes("Invalid data") ? ": invalid media" : ""}`,
            ),
          );
        resolve(out);
      });
    });
  }
  async duration(path: string) {
    const result = await this.run(
      this.settings.ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_type:format=duration",
        "-of",
        "json",
        path,
      ],
      15000,
    );
    let data: any;
    try {
      data = JSON.parse(result);
    } catch {
      throw new BadRequestException("Cannot read video metadata");
    }
    const duration = Number(data.format?.duration) * 1000;
    if (!data.streams?.length || !Number.isFinite(duration) || duration <= 0)
      throw new BadRequestException(
        "Source must contain video with a known duration",
      );
    return duration;
  }
  async extract(path: string, timestampMs: number, output: string) {
    await this.run(this.settings.ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-ss",
      String(timestampMs / 1000),
      "-i",
      path,
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
      "-threads",
      "1",
      "-q:v",
      "2",
      output,
    ]);
    const info = await stat(output).catch(() => null);
    if (!info?.size)
      throw new BadRequestException(
        "No frame at this timestamp; choose an earlier time",
      );
    return info.size;
  }
}
