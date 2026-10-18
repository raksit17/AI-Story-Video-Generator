// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import App from "../src/App.vue";

let wrapper: VueWrapper | undefined;
let requests: Array<{ url: string; options: RequestInit }>;
const imageUrl = "/api/v1/stories/assets/00000000-0000-0000-0000-000000000001.png";
let statusChecks: number;

function reply(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
}

beforeEach(() => {
  localStorage.clear();
  requests = [];
  statusChecks = 0;
  let uuid = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` });
  vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit = {}) => {
    requests.push({ url, options });
    if (url.endsWith("/stories") && options.method === "GET") return reply({ items: [] });
    if (url.endsWith("/stories/character-profiles")) return reply({ items: [] });
    if (url.endsWith("/stories/voice-profiles")) return reply({ items: [] });
    if (url.endsWith("/stories/storyboard")) {
      const body = JSON.parse(String(options.body));
      if (body.prompt === "FAIL PROVIDER") return reply({ message: "Ollama offline" }, 503);
      return reply({
        title: "ลูน่าค้นพบประตู",
        scenes: Array.from({ length: 5 }, (_, i) => ({
          id: `00000000-0000-4000-8000-${String(i+1).padStart(12, "0")}`,
          title: `Scene ${i+1}`,
          narration: `ลูน่าพบประตูเรืองแสงในสำนักงาน ฉาก ${i+1}`,
          imagePrompt: `Luna stands in the office beside a glowing blue portal, scene ${i+1}, cinematic lighting`,
          duration: 7,
          motion: "slow_zoom",
        })),
      });
    }
    if (url.endsWith("/stories/scene-visual")) return reply({
      imagePrompt: "Luna startled as a glowing blue magical portal opens behind her at the office, anime medium shot",
      provider: "ollama",
    });
    if (url.endsWith("/stories") && options.method === "POST") return reply({ id: "saved-story" }, 201);
    if (url.endsWith("/image") && options.method === "POST") {
      return reply({ status: "queued", promptId: "comfy-prompt" }, 201);
    }
    if (url.endsWith("/image/status")) {
      if (url.includes("/old-scene/")) return reply({ status: "completed", url: imageUrl });
      statusChecks++;
      // The initial status check finds no existing result, then the next
      // check after POST receives the completed PNG from ComfyUI history.
      return reply(statusChecks === 1
        ? { status: "idle" }
        : { status: "completed", url: imageUrl });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Storyframe project and ComfyUI image workflow", () => {
  it("creates AI-directed storyboard, saves story, queues image and previews resulting PNG", async () => {
    wrapper = mount(App);
    await wrapper.get(".prompt-panel textarea").setValue("เด็กสาวเดินทางเข้าป่าต้องห้าม");
    await wrapper.get(".generate").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".scene-row")).toHaveLength(5);

    await wrapper.get(".preview-controls button").trigger("click");
    await flushPromises();
    expect(requests.map(r => r.url)).toEqual([
      "/api/v1/stories",
      "/api/v1/stories/character-profiles",
      "/api/v1/stories/voice-profiles",
      "/api/v1/stories/storyboard",
      "/api/v1/stories",
      "/api/v1/stories/saved-story/scenes/00000000-0000-4000-8000-000000000001/image/status",
      "/api/v1/stories/saved-story/scenes/00000000-0000-4000-8000-000000000001/image",
      "/api/v1/stories/saved-story/scenes/00000000-0000-4000-8000-000000000001/image/status",
    ]);
    expect(wrapper.get(".preview-frame").attributes("style")).toContain(imageUrl);
    const project = JSON.parse(localStorage.getItem("storyframe-project-v1")!);
    expect(project.storyId).toBe("saved-story");
    expect(project.scenes[0].imageUrl).toBe(imageUrl);
  });

  it("restores an old completed ComfyUI image when reopening a saved story", async () => {
    localStorage.setItem("storyframe-project-v1", JSON.stringify({
      storyId: "saved-story",
      title: "Test",
      prompt: "Original prompt",
      genre: "Anime Fantasy",
      language: "ไทย",
      ratio: "9:16",
      scenes: [{
        id: "old-scene", title: "Opening", narration: "test",
        imagePrompt: "A moonlit forest", duration: 7,
        image: "", motion: "ซูมเข้า",
      }],
      character: { name: "", look: "", reference: "" },
      voice: "",
      metadata: { title: "", description: "", tags: "" },
      thumbnail: "",
    }));
    wrapper = mount(App);
    await flushPromises();
    expect(requests[0].url).toBe("/api/v1/stories/saved-story/scenes/old-scene/image/status");
    expect(wrapper.get(".preview-frame").attributes("style") ?? "").toContain(imageUrl);
    const saved = JSON.parse(localStorage.getItem("storyframe-project-v1")!);
    expect(saved.scenes[0].imageUrl).toBe(imageUrl);
  });
  it("generates a visual prompt directly from edited narration without silently using a sample story", async () => {
    wrapper = mount(App);
    await wrapper.get(".prompt-panel textarea").setValue("ลูน่าทำงานในสำนักงานจนเกิดประตูมิติ");
    await wrapper.get(".generate").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".scene-row")).toHaveLength(5);
    expect(wrapper.get(".scene-fields textarea").element).toBeTruthy();
    const narration = wrapper.findAll(".scene-fields textarea")[0];
    await narration.setValue("ลูน่าสะดุ้งเมื่อประตูมิติสีน้ำเงินเปิดอยู่ข้างหลังในสำนักงาน");
    const sync = wrapper.findAll("button").find(b => b.text().includes("สร้าง Prompt ภาพจากบทบรรยาย"));
    expect(sync).toBeTruthy();
    await sync!.trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".scene-fields textarea")[1].element).toBeTruthy();
    expect((wrapper.findAll(".scene-fields textarea")[1].element as HTMLTextAreaElement).value)
      .toContain("glowing blue");
    const request = requests.find(r => r.url.endsWith("/scene-visual"));
    expect(request).toBeTruthy();
    expect(JSON.parse(String(request!.options.body)).narration).toContain("ประตูมิติสีน้ำเงิน");
  });

  it("surfaces Ollama failure rather than replacing the user's story with generic scenes", async () => {
    wrapper = mount(App);
    await wrapper.get(".prompt-panel textarea").setValue("FAIL PROVIDER");
    await wrapper.get(".generate").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".scene-row")).toHaveLength(0);
    expect(wrapper.get('[role="alert"]').text()).toContain("Ollama offline");
    expect(wrapper.text()).toContain("ใช้โครงเรื่องตัวอย่าง (ไม่ใช้ AI)");
  });

});
