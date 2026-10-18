import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StoriesService } from "../src/stories/stories.service";

const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const reply = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

describe("Storyframe ComfyUI image recovery", () => {
  let dir: string;
  let service: StoriesService;
  let storyId: string;
  let sceneId: string;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "story-comfy-"));
    process.env.STORY_STORAGE_DIR = dir;
    process.env.COMFYUI_URL = "http://127.0.0.1:8188";
    service = new StoriesService();
    sceneId = randomUUID();
    const story = await service.save({
      title: "Test", scenes: [{ id: sceneId, imagePrompt: "A moonlit forest" }],
    });
    storyId = story.id;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    delete process.env.STORY_STORAGE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test("finds an existing successful ComfyUI image and imports it for rendering", async () => {
    const promptId = randomUUID();
    const image = {
      filename: `${sceneId}_00001_.png`,
      subfolder: `AIStory\\${storyId}`,
      type: "output",
    };
    const fetchMock = jest.fn(async (url: string | URL | Request) => {
      const uri = String(url);
      if (uri.includes("/history?")) return reply({
        [promptId]: { status: { status_str: "success", completed: true }, outputs: { 9: { images: [image] } } },
      });
      if (uri.includes("/view?")) return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
      throw new Error(`Unexpected URL: ${uri}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.sceneImageStatus(storyId, sceneId);
    expect(result.status).toBe("completed");
    const url = (result as { url: string }).url;
    const savedStory = await service.get(storyId);
    expect((savedStory?.scenes as any[])[0].imageUrl).toBe(url);
    const pngPath = join(dir, url.split("/").at(-1)!);
    expect((await stat(pngPath)).size).toBe(PNG.length);
    expect(await readFile(pngPath)).toEqual(Buffer.from(PNG));
    // Once imported, subsequent status requests do not re-fetch from ComfyUI.
    await service.sceneImageStatus(storyId, sceneId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("queues generation and later imports the matching output", async () => {
    const promptId = randomUUID();
    const image = { filename: `${sceneId}_00001_.png`, subfolder: `AIStory/${storyId}`, type: "output" };
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const uri = String(url);
      if (uri.endsWith("/prompt")) return reply({ prompt_id: promptId });
      if (uri.endsWith(`/history/${promptId}`)) return reply({
        [promptId]: { status: { status_str: "success", completed: true }, outputs: { 9: { images: [image] } } },
      });
      if (uri.includes("/view?")) return new Response(PNG, { status: 200 });
      throw new Error(`Unexpected URL: ${uri}`);
    }) as unknown as typeof fetch;

    const started = await service.startSceneImage(storyId, sceneId, "A moonlit forest");
    expect(started).toEqual({ status: "queued", promptId, referenceUsed: false, referenceMode: "none" });
    const persisted = await service.get(storyId);
    expect((persisted?.scenes as any[])[0].imageJob.promptId).toBe(promptId);
    const finished = await service.sceneImageStatus(storyId, sceneId);
    expect(finished.status).toBe("completed");
    const after = await service.get(storyId);
    expect((after?.scenes as any[])[0].imageJob).toBeNull();
    expect((after?.scenes as any[])[0].imageUrl).toBeTruthy();
  });

  test("ignores output files that do not belong to the story's scene", async () => {
    global.fetch = jest.fn(async () => reply({
      other: {
        status: { status_str: "success", completed: true },
        outputs: { 9: { images: [{
          filename: `${randomUUID()}_00001_.png`,
          subfolder: `AIStory/${storyId}`, type: "output",
        }] } },
      },
    })) as unknown as typeof fetch;
    const status = await service.sceneImageStatus(storyId, sceneId);
    expect(status.status).toBe("idle");
  });
  test("conditions each new SDXL latent with a real uploaded character image via IP-Adapter", async () => {
    const profile = await service.saveCharacter({
      name: "Luna",
      description: "Brown hair, navy office vest",
      referenceData: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    });
    const saved = await service.save({
      title: "Scene with Luna",
      aspect: "9:16",
      scenes: [{ id: sceneId, imagePrompt: "Luna at sunset" }],
      characters: [{ id: profile.id, name: profile.name, description: profile.description, referenceUrl: profile.referenceUrl }],
    }, storyId);
    expect(saved.characters).toHaveLength(1);
    let uploaded = false;
    let queuedGraph: any;
    const promptId = randomUUID();
    global.fetch = jest.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const uri = String(url);
      if (uri.endsWith("/object_info/IPAdapterAdvanced")) {
        return reply({ IPAdapterAdvanced: { input: { required: {
          model: ["MODEL"], ipadapter: ["IPADAPTER"], image: ["IMAGE"],
        } } } });
      }
      if (uri.endsWith("/object_info/IPAdapterModelLoader")) {
        return reply({ IPAdapterModelLoader: { input: { required: {
          ipadapter_file: [["ip-adapter-plus_sdxl_vit-h.safetensors"]],
        } } } });
      }
      if (uri.endsWith("/object_info/CLIPVisionLoader")) {
        return reply({ CLIPVisionLoader: { input: { required: {
          clip_name: [["CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"]],
        } } } });
      }
      if (uri.endsWith("/upload/image")) {
        expect(options?.method).toBe("POST");
        const form = options?.body as FormData;
        const file = form.get("image") as File;
        expect(file).toBeTruthy();
        expect(Buffer.from(await file.arrayBuffer())).toEqual(Buffer.from(PNG));
        uploaded = true;
        return reply({ name: "luna.png", subfolder: "" });
      }
      if (uri.endsWith("/prompt")) {
        expect(uploaded).toBe(true);
        queuedGraph = JSON.parse(String(options?.body)).prompt;
        return reply({ prompt_id: promptId });
      }
      throw new Error(`Unexpected ComfyUI request: ${uri}`);
    }) as typeof fetch;
    const started = await service.startSceneImage(storyId, sceneId, "Luna at sunset");
    expect(started).toMatchObject({ promptId, referenceUsed: true, referenceMode: "ipadapter" });
    expect(queuedGraph["20"]).toMatchObject({ class_type: "LoadImage", inputs: { image: "luna.png" } });
    expect(queuedGraph["21"].class_type).toBe("CLIPVisionLoader");
    expect(queuedGraph["22"].class_type).toBe("IPAdapterModelLoader");
    expect(queuedGraph["23"]).toMatchObject({
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["4", 0], ipadapter: ["22", 0], image: ["20", 0],
        clip_vision: ["21", 0], weight: 0.7,
      },
    });
    expect(queuedGraph["3"].inputs.model).toEqual(["23", 0]);
    expect(queuedGraph["3"].inputs.latent_image).toEqual(["5", 0]);
    expect(queuedGraph["3"].inputs.denoise).toBe(1);
    expect(queuedGraph["6"].inputs.text).toContain("Luna at sunset");
    expect(queuedGraph["11"]).toBeUndefined();
    expect(queuedGraph["12"]).toBeUndefined();
    const storyAfter = await service.get(storyId);
    expect((storyAfter?.scenes as any[])[0].imageReferenceUrl).toBe(profile.referenceUrl);
    expect((storyAfter?.scenes as any[])[0].imageReferenceMode).toBe("ipadapter");
  });

  test("rejects missing character PNG rather than silently generating text-only", async () => {
    const fake = `/api/v1/stories/assets/${randomUUID()}.png`;
    await service.save({
      title: "Broken reference",
      scenes: [{ id: sceneId, imagePrompt: "Luna at sunset" }],
      characters: [{ id: randomUUID(), name: "Luna", referenceUrl: fake }],
    }, storyId);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    await expect(service.startSceneImage(storyId, sceneId, "Luna at sunset"))
      .rejects.toThrow("Character reference missing from API storage");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fails explicitly when IPAdapterAdvanced custom node is not installed", async () => {
    const profile = await service.saveCharacter({
      name: "Luna", description: "Brown hair, navy vest",
      referenceData: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    });
    await service.save({ title: "Story", scenes: [{ id: sceneId, imagePrompt: "Forest" }],
      characters: [{ id: profile.id, name: "Luna", referenceUrl: profile.referenceUrl }] }, storyId);
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/object_info/IPAdapterAdvanced")) return reply({});
      throw new Error("Should not try uploading or generating without IP-Adapter");
    }) as typeof fetch;
    await expect(service.startSceneImage(storyId, sceneId, "Forest"))
      .rejects.toThrow("Missing ComfyUI node IPAdapterAdvanced");
  });

  test("queues Animagine XL 3.1 with its own checkpoint, quality prompts, sampler and new scene latent", async () => {
    await service.save({
      title: "Animagine scene",
      imageModel: "animagine-xl-3.1",
      scenes: [{ id: sceneId, imagePrompt: "Luna typing at a desk, bright meeting room" }],
    }, storyId);
    let graph: Record<string, any> = {};
    const fetchMock = jest.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const uri = String(url);
      if (uri.endsWith("/object_info/CheckpointLoaderSimple")) {
        return reply({ CheckpointLoaderSimple: { input: { required: {
          ckpt_name: [["sd_xl_base_1.0.safetensors", "animagine-xl-3.1.safetensors"]],
        } } } });
      }
      if (uri.endsWith("/prompt")) {
        graph = JSON.parse(String(options?.body)).prompt;
        return reply({ prompt_id: randomUUID() });
      }
      throw new Error("Unexpected ComfyUI request: " + uri);
    });
    global.fetch = fetchMock as typeof fetch;
    const started = await service.startSceneImage(storyId, sceneId, "Luna typing at a desk, bright meeting room");
    expect(started.status).toBe("queued");
    expect(graph["4"].inputs.ckpt_name).toBe("animagine-xl-3.1.safetensors");
    expect(graph["3"].inputs.steps).toBe(28);
    expect(graph["3"].inputs.cfg).toBe(6);
    expect(graph["3"].inputs.sampler_name).toBe("euler_ancestral");
    expect(graph["3"].inputs.latent_image).toEqual(["5", 0]);
    expect(graph["6"].inputs.text).toContain("masterpiece, best quality, very aesthetic, absurdres");
    expect(graph["6"].inputs.text).toContain("Luna typing at a desk");
    expect(graph["7"].inputs.text).toContain("bad hands");
    const stored = await service.get(storyId);
    expect((stored?.scenes as any[])[0].imageModel).toBe("animagine-xl-3.1");
  });

  test("reports missing Animagine checkpoint and does not queue a different model", async () => {
    await service.save({
      title: "Animagine missing",
      imageModel: "animagine-xl-3.1",
      scenes: [{ id: sceneId, imagePrompt: "Luna in a forest" }],
    }, storyId);
    const mock = jest.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/object_info/CheckpointLoaderSimple")) {
        return reply({ CheckpointLoaderSimple: { input: { required: {
          ckpt_name: [["sd_xl_base_1.0.safetensors"]],
        } } } });
      }
      throw new Error("Should not submit image generation when checkpoint is missing");
    });
    global.fetch = mock as typeof fetch;
    await expect(service.startSceneImage(storyId, sceneId, "Luna in a forest"))
      .rejects.toThrow("Animagine XL 3.1 checkpoint not found");
    expect(mock).toHaveBeenCalledTimes(1);
  });

});
