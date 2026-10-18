import type { AiInput, AiJob } from "../types";
import type { Crop, RemovalResult } from "../types";
import type {
  Asset,
  Draft,
  DraftSummary,
  Page,
  ThumbnailDocument,
  Video,
} from "../types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class ApiClient {
  constructor(
    public base: string,
    private key = "",
  ) {
    this.base = base.trim().replace(/\/$/, "");
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.key) headers.set("X-API-Key", this.key);
    if (typeof init.body === "string")
      headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await fetch(this.base + path, { ...init, headers });
    } catch {
      throw new ApiError(
        "เชื่อมต่อ API ไม่ได้ ตรวจว่า NestJS เปิดที่พอร์ต 3002 และตั้ง URL/CORS ถูกต้อง",
        0,
      );
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(" · ")
        : body?.message;
      throw new ApiError(
        response.status === 409
          ? "Draft ถูกแก้ไขจากที่อื่น กรุณาเปิด Draft ล่าสุด หรือเลือก “บันทึกเป็นใหม่” เพื่อเก็บงานนี้"
          : message || `API error ${response.status}`,
        response.status,
      );
    }
    return response.json();
  }
  removeBackground(videoId: string, sourceAssetId: string, crop: Crop) {
    return this.request<RemovalResult>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/remove-background`,
      { method: "POST", body: JSON.stringify({ sourceAssetId, crop }) },
    );
  }
  aiHealth(videoId: string) {
    return this.request<{
      status: string;
      checkpoint: string;
      checkpointAvailable: boolean;
      idle: boolean;
    }>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/ai-backgrounds/health`,
    );
  }
  aiJobs(videoId: string) {
    return this.request<{ items: AiJob[] }>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/ai-backgrounds`,
    );
  }
  generateBackground(videoId: string, input: AiInput) {
    return this.request<AiJob>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/ai-backgrounds`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }
  cancelAiJob(videoId: string, id: string) {
    return this.request<AiJob>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/ai-backgrounds/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }
  health() {
    return this.request("/health");
  }
  videos(next: { cursor?: string; offset?: number } = {}) {
    const params = new URLSearchParams({ limit: "50" });
    if (next.cursor) params.set("cursor", next.cursor);
    if (next.offset != null) params.set("offset", String(next.offset));
    return this.request<Page<Video>>("/videos?" + params);
  }
  assets(videoId: string, kind: "frames" | "images" | "exports", offset = 0) {
    return this.request<Page<Asset>>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/${kind}?offset=${offset}`,
    );
  }
  frames(videoId: string, timestampsMs: number[]) {
    return this.request<{ items: Asset[] }>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/frames`,
      { method: "POST", body: JSON.stringify({ timestampsMs }) },
    );
  }
  drafts(videoId: string, offset = 0) {
    return this.request<Page<DraftSummary>>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/drafts?offset=${offset}`,
    );
  }
  draft(videoId: string, id: string) {
    return this.request<Draft>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/drafts/${encodeURIComponent(id)}`,
    );
  }
  save(
    videoId: string,
    name: string,
    document: ThumbnailDocument,
    current?: { id: string; revision: number },
  ) {
    return this.request<Draft>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/drafts${current ? "/" + encodeURIComponent(current.id) : ""}`,
      {
        method: current ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          document,
          ...(current ? { revision: current.revision } : {}),
        }),
      },
    );
  }
  deleteDraft(videoId: string, id: string, revision: number) {
    return this.request(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/drafts/${encodeURIComponent(id)}?revision=${revision}`,
      { method: "DELETE" },
    );
  }
  upload(
    videoId: string,
    kind: "images" | "exports",
    file: Blob,
    filename: string,
  ) {
    const data = new FormData();
    data.append("file", file, filename);
    return this.request<Asset>(
      `/videos/${encodeURIComponent(videoId)}/thumbnails/${kind}`,
      { method: "POST", body: data },
    );
  }
  async blob(id: string) {
    // Construct from the configured API base; never forward API keys to returned third-party URLs.
    let response: Response;
    try {
      response = await fetch(
        `${this.base}/assets/${encodeURIComponent(id)}/file`,
        { headers: this.key ? { "X-API-Key": this.key } : {} },
      );
    } catch {
      throw new ApiError("โหลดภาพจาก API ไม่สำเร็จ", 0);
    }
    if (!response.ok)
      throw new ApiError(
        `โหลดภาพไม่สำเร็จ (${response.status})`,
        response.status,
      );
    return response.blob();
  }
}
