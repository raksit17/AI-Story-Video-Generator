// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import App from "../src/App.vue";
vi.mock("../src/components/ThumbnailCanvas.vue", () => ({
  default: {
    props: ["document", "images", "selected", "disabled"],
    template: '<div data-test="canvas" />',
  },
}));
vi.mock("../src/lib/scene", () => ({
  exportScene: vi.fn(
    async () => new Blob(["rendered-image"], { type: "image/jpeg" }),
  ),
}));
import { exportScene } from "../src/lib/scene";
let wrapper: VueWrapper,
  requests: { url: string; options: any }[],
  saved: any,
  conflict: boolean;
const asset = {
  id: "frame-1",
  videoId: "v1",
  kind: "frame",
  width: 1280,
  height: 720,
  timestampMs: 18000,
  mimeType: "image/jpeg",
  url: "/api/v1/assets/frame-1/file",
};
function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}
async function click(text: string) {
  const button = wrapper.findAll("button").find((b) => b.text() === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await button.trigger("click");
  await flushPromises();
}
beforeEach(() => {
  localStorage.clear();
  requests = [];
  saved = null;
  conflict = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options: any = {}) => {
      requests.push({ url, options });
      if (url.endsWith("/health")) return reply({ status: "ok" });
      if (url.startsWith("/api/v1/videos?"))
        return reply({
          items: [
            {
              id: "v1",
              externalId: "raora",
              title: "Raora horror",
              durationMs: 60000,
            },
          ],
          nextCursor: null,
        });
      if (url.includes("/assets/"))
        return Promise.resolve(new Response(new Blob(["image"])));
      if (url.endsWith("/frames") && options.method === "POST")
        return reply({ items: [asset] });
      if (url.includes("/frames?"))
        return reply({ items: [], nextOffset: null });
      if (url.includes("/images?") || url.includes("/exports?"))
        return reply({ items: [], nextOffset: null });
      if (url.includes("/drafts?"))
        return reply({ items: saved ? [saved] : [], nextOffset: null });
      if (
        url.includes("/drafts") &&
        (options.method === "POST" || options.method === "PUT")
      ) {
        if (conflict && options.method === "PUT")
          return reply({ message: "conflict" }, 409);
        const payload = JSON.parse(options.body);
        saved = {
          id: "d1",
          videoId: "v1",
          revision: options.method === "PUT" ? 2 : 1,
          updatedAt: new Date().toISOString(),
          ...payload,
        };
        return reply(saved);
      }
      if (url.endsWith("/drafts/d1")) return reply(saved);
      if (url.endsWith("/exports") && options.method === "POST")
        return reply({ ...asset, id: "export-1", kind: "export" });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal("URL", URL);
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  wrapper = mount(App);
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Vue workflow with API fixture (canvas rendering stubbed)", () => {
  it("connects, extracts a frame, adds Thai text, saves and exports correct document", async () => {
    await flushPromises();
    await wrapper.get("#video").setValue("v1");
    await flushPromises();
    await wrapper.get("#times").setValue("00:18");
    await click("ดึงเฟรมจากวิดีโอ ↗");
    expect(
      JSON.parse(
        requests.find(
          (r) => r.options.method === "POST" && r.url.endsWith("/frames"),
        )!.options.body,
      ),
    ).toEqual({ timestampsMs: [18000] });
    await wrapper.get('[aria-label="ใช้เฟรม 00:18"]').trigger("click");
    await click("เพิ่มข้อความ");
    await wrapper
      .get('[aria-label="ข้อความบนภาพปก"]')
      .setValue("ใครอยู่ข้างหลัง!?");
    await click("บันทึก Draft");
    expect(saved.document.backgroundAssetId).toBe("frame-1");
    expect(saved.document.elements[0].text).toBe("ใครอยู่ข้างหลัง!?");
    expect(saved.document.width).toBe(1280);
    await click("ดาวน์โหลดภาพปก");
    expect(exportScene).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1280, height: 720 }),
      expect.objectContaining({ "frame-1": expect.anything() }),
      "jpeg",
    );
    expect(
      requests.some(
        (r) => r.url.endsWith("/exports") && r.options.method === "POST",
      ),
    ).toBe(true);
  });
  it("undo/redo restores text layers and conflict preserves unsaved work", async () => {
    await flushPromises();
    await wrapper.get("#video").setValue("v1");
    await flushPromises();
    await click("เพิ่มข้อความ");
    expect(wrapper.find('[aria-label="ข้อความบนภาพปก"]').exists()).toBe(true);
    await wrapper.get('[aria-label="ย้อนกลับ"]').trigger("click");
    expect(wrapper.find('[aria-label="ข้อความบนภาพปก"]').exists()).toBe(false);
    await wrapper.get('[aria-label="ทำซ้ำ"]').trigger("click");
    await click("บันทึก Draft");
    conflict = true;
    await wrapper
      .get('[aria-label="ชื่อภาพปก"]')
      .setValue("งานใหม่ที่ต้องเก็บ");
    await click("บันทึก Draft");
    expect(wrapper.get('[role="alert"]').text()).toContain("บันทึกเป็นใหม่");
    expect(
      (wrapper.get('[aria-label="ชื่อภาพปก"]').element as HTMLInputElement)
        .value,
    ).toBe("งานใหม่ที่ต้องเก็บ");
    await click("บันทึกเป็นใหม่");
    expect(saved.name).toBe("งานใหม่ที่ต้องเก็บ");
  });
});
