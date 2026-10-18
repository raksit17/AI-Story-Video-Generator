import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GenerateBackgroundDto } from "./ai.dto";
const STYLES = {
  horror:
    "dark abandoned corridor, eerie purple cinematic lighting, ominous shadows, horror gaming atmosphere",
  funny:
    "bright pink and yellow comic burst, playful pop art, energetic speed lines",
  cute: "soft pastel pink and lavender, dreamy bokeh, cute decorative stars",
  epic: "dramatic blue and orange cinematic lighting, electric energy, bold contrast",
};
export class ComfyRejected extends Error {}
@Injectable()
export class ComfyUiService {
  readonly base = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(
    /\/$/,
    "",
  );
  readonly checkpoint =
    process.env.COMFYUI_CHECKPOINT ?? "sd_xl_base_1.0.safetensors";
  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(this.base + path, {
      ...options,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) {
      if (path === "/prompt" && response.status >= 400 && response.status < 500)
        throw new ComfyRejected(
          `ComfyUI rejected workflow (HTTP ${response.status}); check checkpoint and node inputs.`,
        );
      throw new Error(
        `ComfyUI ${path.split("?")[0]} returned HTTP ${response.status}`,
      );
    }
    return response;
  }
  async idle() {
    const q = await (await this.request("/queue")).json();
    if (!Array.isArray(q.queue_running) || !Array.isArray(q.queue_pending))
      throw new Error("Invalid ComfyUI queue response");
    return q.queue_running.length === 0 && q.queue_pending.length === 0;
  }
  async health() {
    const info = await (
      await this.request("/object_info/CheckpointLoaderSimple")
    ).json();
    const checkpoints =
      info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
    return {
      status: "ok",
      checkpoint: this.checkpoint,
      checkpointAvailable:
        Array.isArray(checkpoints) && checkpoints.includes(this.checkpoint),
      idle: await this.idle(),
    };
  }
  async workflow(input: GenerateBackgroundDto, seed: number, jobId: string) {
    const graph = JSON.parse(
      await readFile(
        join(process.cwd(), "workflows/sdxl-background-api.json"),
        "utf8",
      ),
    );
    graph["4"].inputs.ckpt_name = this.checkpoint;
    Object.assign(graph["3"].inputs, {
      seed,
      steps: input.steps ?? 22,
      cfg: input.cfg ?? 6,
    });
    Object.assign(graph["5"].inputs, {
      width: input.resolution === "low" ? 768 : 1024,
      height: input.resolution === "low" ? 448 : 576,
      batch_size: 1,
    });
    graph["6"].inputs.text =
      `${input.prompt.trim()}, ${STYLES[input.style]}, wide composition, empty scene, background only, no people, no characters, no lettering`;
    graph["7"].inputs.text =
      `text, watermark, logo, people, anime girl, character, blurry, low quality${input.negativePrompt ? ", " + input.negativePrompt : ""}`;
    graph["9"].inputs.filename_prefix = `HoloMoment/${jobId}/${seed}`;
    return graph;
  }
  async submit(workflow: unknown, clientId: string) {
    const r = await (
      await this.request("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      })
    ).json();
    if (r.error || Object.keys(r.node_errors ?? {}).length)
      throw new ComfyRejected(
        "ComfyUI workflow validation failed; verify checkpoint and built-in nodes.",
      );
    if (typeof r.prompt_id !== "string" || !r.prompt_id)
      throw new Error(
        "ComfyUI did not return prompt_id; acceptance is unknown",
      );
    return r.prompt_id as string;
  }
  async history(id: string) {
    const h = await (
      await this.request("/history/" + encodeURIComponent(id))
    ).json();
    return h[id];
  }
  async image(file: { filename: string; subfolder?: string; type: string }) {
    // Only a generated output descriptor supplied by /history is accepted, never a browser URL/path.
    if (
      file.type !== "output" ||
      typeof file.filename !== "string" ||
      !file.filename ||
      /[\\/\x00]/.test(file.filename) ||
      file.filename === ".." ||
      typeof (file.subfolder ?? "") !== "string" ||
      (file.subfolder ?? "").split(/[\\/]/).includes("..") ||
      /^[\\/]|\x00|:/.test(file.subfolder ?? "")
    )
      throw new Error("Invalid ComfyUI output descriptor");
    const query = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder ?? "",
      type: "output",
    });
    const response = await this.request("/view?" + query);
    if (!response.body) throw new Error("Empty ComfyUI output");
    const reader = response.body.getReader(),
      parts: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 10 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("ComfyUI output exceeds 10 MiB");
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(parts);
  }
}
