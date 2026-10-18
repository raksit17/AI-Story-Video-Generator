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
    expect(started).toEqual({ status: "queued", promptId });
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
});
