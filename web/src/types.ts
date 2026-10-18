export interface Video {
  id: string;
  externalId: string;
  title: string;
  durationMs: number | null;
  channelName?: string;
}
export interface Asset {
  id: string;
  videoId: string;
  kind: "frame" | "image" | "export";
  mimeType: string;
  width: number;
  height: number;
  timestampMs: number | null;
  sizeBytes: number;
  url: string;
}
export interface Element {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  assetId?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  align?: "left" | "center" | "right";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}
export interface ThumbnailDocument {
  version: 1;
  width: 1280;
  height: 720;
  backgroundColor: string;
  backgroundAssetId?: string;
  elements: Element[];
}
export interface DraftSummary {
  id: string;
  videoId: string;
  name: string;
  revision: number;
  updatedAt: string;
}
export interface Draft extends DraftSummary {
  document: ThumbnailDocument;
}
export interface Page<T> {
  items: T[];
  nextCursor?: string | null;
  nextOffset?: number | null;
}

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RemovalResult {
  source: Asset;
  cutout: Asset;
  crop: Crop;
  model: string;
}

export type AiStyle = "horror" | "funny" | "cute" | "epic";
export interface AiInput {
  requestId: string;
  style: AiStyle;
  prompt: string;
  negativePrompt?: string;
  variations: number;
  seed?: number;
  resolution?: "standard" | "low";
  steps?: number;
  cfg?: number;
}
export interface AiJob {
  id: string;
  videoId: string;
  status:
    "queued" | "submitting" | "running" | "completed" | "failed" | "cancelled";
  input: AiInput;
  cancelRequested: boolean;
  createdAt: string;
  state: {
    assets: Asset[];
    seeds: number[];
    promptId?: string;
    error?: string;
    message?: string;
  };
}
