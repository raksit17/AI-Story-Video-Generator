import "dotenv/config";
import { resolve } from "node:path";
export function config() {
  const mode = process.env.VIDEO_CATALOG_MODE ?? "api";
  if (!["api", "database", "local"].includes(mode))
    throw new Error("Invalid VIDEO_CATALOG_MODE");
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (mode === "database" && !process.env.HIGHLIGHT_DATABASE_URL)
    throw new Error("HIGHLIGHT_DATABASE_URL is required");
  const host = process.env.HOST ?? "127.0.0.1";
  const apiKey = process.env.API_KEY ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !apiKey)
    throw new Error("Set API_KEY before binding to a non-loopback address");
  return {
    mode,
    port,
    host,
    apiKey,
    databaseUrl,
    highlightDatabaseUrl: process.env.HIGHLIGHT_DATABASE_URL,
    highlightApiUrl: (
      process.env.HIGHLIGHT_API_URL ?? "http://127.0.0.1:3001/api/v1"
    ).replace(/\/$/, ""),
    sourceDir: resolve(process.env.VIDEO_SOURCE_DIR ?? "./storage/sources"),
    storageDir: resolve(process.env.STORAGE_DIR ?? "./storage"),
    ffmpeg: process.env.FFMPEG_PATH ?? "ffmpeg",
    ffprobe: process.env.FFPROBE_PATH ?? "ffprobe",
    origins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((x) => x.trim()),
  };
}
