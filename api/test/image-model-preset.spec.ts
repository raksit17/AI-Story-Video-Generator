import { imageModelConfiguration, resolveImageModelPreset } from "../src/stories/image-model-preset";

describe("Storyframe image model presets", () => {
  const originalDefault = process.env.COMFYUI_IMAGE_MODEL;
  const originalCheckpoint = process.env.COMFYUI_ANIMAGINE_CHECKPOINT;

  afterEach(() => {
    if (originalDefault === undefined) delete process.env.COMFYUI_IMAGE_MODEL;
    else process.env.COMFYUI_IMAGE_MODEL = originalDefault;
    if (originalCheckpoint === undefined) delete process.env.COMFYUI_ANIMAGINE_CHECKPOINT;
    else process.env.COMFYUI_ANIMAGINE_CHECKPOINT = originalCheckpoint;
  });

  it("preserves SDXL Base for older projects and rejects arbitrary checkpoint paths", () => {
    delete process.env.COMFYUI_IMAGE_MODEL;
    expect(resolveImageModelPreset(undefined)).toBe("sdxl-base");
    const config = imageModelConfiguration("sdxl-base", "Luna in a forest");
    expect(config.sampler).toBe("euler");
    expect(config.steps).toBe(22);
    expect(config.positive).toContain("Luna in a forest");
    expect(() => resolveImageModelPreset("../../unsafe.safetensors")).toThrow("Unknown image model preset");
  });

  it("uses model-specific anime aesthetic tags and Euler Ancestral for Animagine XL 3.1", () => {
    const config = imageModelConfiguration("animagine-xl-3.1", "Luna typing at a desk");
    expect(config).toMatchObject({
      id: "animagine-xl-3.1",
      checkpoint: "animagine-xl-3.1.safetensors",
      steps: 28, cfg: 6, sampler: "euler_ancestral",
    });
    expect(config.positive).toContain("masterpiece, best quality, very aesthetic, absurdres");
    expect(config.positive).toContain("Luna typing at a desk");
    expect(config.negative).toContain("bad hands");
    expect(config.negative).toContain("watermark");
  });

  it("allows a different actual Animagine checkpoint filename in ComfyUI", () => {
    process.env.COMFYUI_ANIMAGINE_CHECKPOINT = "models--animagine-xl-3.1.safetensors";
    expect(imageModelConfiguration("animagine-xl-3.1", "Luna").checkpoint)
      .toBe("models--animagine-xl-3.1.safetensors");
  });
});
