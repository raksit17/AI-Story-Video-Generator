import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../src/services/api";
import { blank } from "../src/lib/editor";
afterEach(() => vi.unstubAllGlobals());
describe("Nest API contract", () => {
  it("posts integer timestampsMs and X-API-Key", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal("fetch", mock);
    await new ApiClient("/api/v1", "secret").frames("video/id", [12000, 18000]);
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe("/api/v1/videos/video%2Fid/thumbnails/frames");
    expect(JSON.parse(options.body)).toEqual({ timestampsMs: [12000, 18000] });
    expect(options.headers.get("X-API-Key")).toBe("secret");
  });
  it("sends stored source and pixel crop to video-scoped removal route", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", mock);
    const crop = { x: 20, y: 30, width: 400, height: 600 };
    await new ApiClient("/api/v1", "secret").removeBackground(
      "v",
      "source",
      crop,
    );
    expect(mock.mock.calls[0][0]).toBe(
      "/api/v1/videos/v/thumbnails/remove-background",
    );
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({
      sourceAssetId: "source",
      crop,
    });
  });
  it("uses POST for save-as-new and PUT with revision for update", async () => {
    const mock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", mock);
    const api = new ApiClient("/api/v1");
    await api.save("v", "ปก", blank());
    await api.save("v", "ปก", blank(), { id: "draft", revision: 3 });
    expect(mock.mock.calls[0][1].method).toBe("POST");
    expect(mock.mock.calls[1][1].method).toBe("PUT");
    expect(JSON.parse(mock.mock.calls[1][1].body).revision).toBe(3);
  });
  it("reports conflicts without automatically overwriting", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("{}", { status: 409 }));
    vi.stubGlobal("fetch", mock);
    await expect(
      new ApiClient("/api").save("v", "ปก", blank(), { id: "d", revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("preserves multipart boundary and fetches assets only from configured API", async () => {
    const mock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", mock);
    const api = new ApiClient("http://localhost:3002/api/v1", "key");
    await api.upload("v", "exports", new Blob(["png"]), "ปก.png");
    expect(mock.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
    await api.blob("a/b");
    expect(mock.mock.calls[1][0]).toBe(
      "http://localhost:3002/api/v1/assets/a%2Fb/file",
    );
  });
});
