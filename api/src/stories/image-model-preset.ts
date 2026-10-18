import { BadRequestException } from "@nestjs/common";

export type ImageModelPreset = "sdxl-base" | "animagine-xl-3.1";

/** Explicit, allowlisted checkpoints: never accept arbitrary file paths from the browser. */
export function resolveImageModelPreset(input: unknown): ImageModelPreset {
  const selected = input || process.env.COMFYUI_IMAGE_MODEL || "sdxl-base";
  if (selected === "sdxl-base" || selected === "animagine-xl-3.1") return selected;
  throw new BadRequestException("Unknown image model preset. Select SDXL Base or Animagine XL 3.1.");
}

export interface ImageModelConfiguration {
  id: ImageModelPreset;
  checkpoint: string;
  steps: number;
  cfg: number;
  sampler: string;
  positive: string;
  negative: string;
}

export function imageModelConfiguration(preset: ImageModelPreset, scenePrompt: string): ImageModelConfiguration {
  if (preset === "animagine-xl-3.1") {
    return {
      id: preset,
      checkpoint: process.env.COMFYUI_ANIMAGINE_CHECKPOINT || "animagine-xl-3.1.safetensors",
      steps: 28,
      cfg: 6,
      sampler: "euler_ancestral",
      positive: `masterpiece, best quality, very aesthetic, absurdres, anime illustration, ${scenePrompt}`,
      negative: "nsfw, lowres, bad anatomy, bad hands, text, error, extra fingers, missing fingers, extra limbs, fewer digits, cropped, worst quality, low quality, jpeg artifacts, watermark, signature, blurry, distorted face, deformed eyes, unfinished",
    };
  }
  // Preserve original behaviour for stories created before the new preset.
  return {
    id: preset,
    checkpoint: process.env.COMFYUI_CHECKPOINT || "sd_xl_base_1.0.safetensors",
    steps: 22,
    cfg: 6,
    sampler: "euler",
    positive: `${scenePrompt}, cinematic illustration, consistent story character design`,
    negative: "text, watermark, logo, blurry, deformed, low quality",
  };
}
