// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AIBackgroundDialog from "../src/components/AIBackgroundDialog.vue";
import { blank } from "../src/lib/editor";
vi.mock("../src/lib/scene", () => ({
  exportScene: vi.fn(async () => new Blob(["preview"])),
}));
vi.mock("../src/lib/images", () => ({
  ImageCache: class {
    async load() {
      return {
        image: { naturalWidth: 1280, naturalHeight: 720 },
        url: "blob:source",
      };
    }
    dispose() {}
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("AI Generator Vue workflow", () => {
  it("submits, shows completed composition and emits editable document", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    const asset = { id: "background", videoId: "v", width: 1280, height: 720 };
    const job = {
      id: "job",
      videoId: "v",
      createdAt: new Date().toISOString(),
      status: "completed",
      input: { style: "horror", prompt: "corridor", variations: 1 },
      state: { assets: [asset], seeds: [12] },
    };
    let submitted = false;
    const api = {
      aiJobs: vi.fn(async () => ({ items: submitted ? [job] : [] })),
      generateBackground: vi.fn(async () => {
        submitted = true;
        return job;
      }),
    };
    const doc = blank();
    doc.elements = [
      {
        id: "title",
        type: "text",
        text: "กรี๊ดลั่น!!",
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      },
    ];
    const wrapper = mount(AIBackgroundDialog, {
      props: { api: api as any, videoId: "v", document: doc, images: {} },
    });
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "สร้างพื้นหลัง")!
      .trigger("click");
    await flushPromises();
    expect(api.generateBackground).toHaveBeenCalledWith(
      "v",
      expect.objectContaining({
        style: "horror",
        variations: 3,
        requestId: expect.any(String),
      }),
    );
    expect(wrapper.find("img").attributes("src")).toBe("blob:preview");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "ใช้แบบนี้ใน Editor")!
      .trigger("click");
    const emitted = wrapper.emitted("apply")![0][0] as any;
    expect(emitted.backgroundAssetId).toBe("background");
    expect(emitted.elements[0].text).toBe("กรี๊ดลั่น!!");
    wrapper.unmount();
  });
  it("reuses requestId after a lost response and stops polling on unmount", async () => {
    vi.useFakeTimers();
    const api = {
      aiJobs: vi.fn(async () => ({ items: [] })),
      generateBackground: vi.fn().mockRejectedValue(new Error("lost response")),
    };
    const wrapper = mount(AIBackgroundDialog, {
      props: { api: api as any, videoId: "v", document: blank(), images: {} },
    });
    await flushPromises();
    const button = wrapper
      .findAll("button")
      .find((b) => b.text() === "สร้างพื้นหลัง")!;
    await button.trigger("click");
    await flushPromises();
    await button.trigger("click");
    await flushPromises();
    expect(api.generateBackground.mock.calls[0][1].requestId).toBe(
      api.generateBackground.mock.calls[1][1].requestId,
    );
    wrapper.unmount();
    const count = api.aiJobs.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.aiJobs).toHaveBeenCalledTimes(count);
  });
});
