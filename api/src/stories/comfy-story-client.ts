import { ServiceUnavailableException } from "@nestjs/common";

export type ComfyImage = {
  filename: string;
  subfolder: string;
  type: "output";
};

type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
  outputs?: Record<string, { images?: ComfyImage[] }>;
};

async function readJson(url: string, timeoutMs = 15000): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ServiceUnavailableException(`ComfyUI is unreachable: ${String(error)}`);
  }
  if (!response.ok) {
    throw new ServiceUnavailableException(`ComfyUI request failed (${response.status})`);
  }
  return response.json();
}

export function outputImage(entry: HistoryEntry | undefined): ComfyImage | undefined {
  // This repository's SDXL workflow uses SaveImage node 9.
  const item = entry?.outputs?.["9"]?.images?.[0];
  if (!item || !item.filename || item.type !== "output") return undefined;
  return item;
}

export async function promptHistory(base: string, promptId: string): Promise<HistoryEntry | undefined> {
  const history = await readJson(`${base}/history/${encodeURIComponent(promptId)}`);
  return history[promptId] as HistoryEntry | undefined;
}

export async function recoverPreviousOutput(
  base: string,
  storyId: string,
  sceneId: string,
): Promise<{ promptId: string; image: ComfyImage } | undefined> {
  // Supports completed jobs created by the previous synchronous /image endpoint.
  // The workflow writes to AIStory/<storyId>/<sceneId>_*.png.
  const history = await readJson(`${base}/history?max_items=100`, 20000) as Record<string, HistoryEntry>;
  const matches: Array<{ promptId: string; image: ComfyImage }> = [];
  for (const [promptId, entry] of Object.entries(history)) {
    if (entry.status?.status_str !== "success") continue;
    const image = outputImage(entry);
    if (!image) continue;
    const folder = String(image.subfolder ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (folder !== `AIStory/${storyId}` || !image.filename.startsWith(`${sceneId}_`)) continue;
    matches.push({ promptId, image });
  }
  return matches.at(-1);
}

export async function retrieveComfyPng(base: string, image: ComfyImage): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? "",
    type: "output",
  });
  let response: Response;
  try {
    response = await fetch(`${base}/view?${params}`, { signal: AbortSignal.timeout(30000) });
  } catch (error) {
    throw new ServiceUnavailableException(`ComfyUI PNG download failed: ${String(error)}`);
  }
  if (!response.ok) throw new ServiceUnavailableException(`ComfyUI PNG download returned ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 12 * 1024 * 1024) throw new ServiceUnavailableException("Generated image exceeds 12 MiB");
  const bytes = Buffer.from(await response.arrayBuffer());
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature) || bytes.length > 12 * 1024 * 1024)
    throw new ServiceUnavailableException("ComfyUI returned an invalid or oversized PNG");
  return bytes;
}
