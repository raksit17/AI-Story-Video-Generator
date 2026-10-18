import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { VideosService } from "../src/videos/videos.service";
import { DatabaseService } from "../src/database/database.service";
import { FrameExtractorService } from "../src/media/frame-extractor.service";
describe("Existing highlight API adapter", () => {
  let server: Server, videos: VideosService;
  const seen: string[] = [];
  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://unused:unused@localhost/test";
    process.env.VIDEO_CATALOG_MODE = "api";
    process.env.HOST = "127.0.0.1";
    server = createServer((req, res) => {
      seen.push(req.url!);
      res.setHeader("Content-Type", "application/json");
      if (req.url!.startsWith("/api/v1/videos?"))
        return res.end(
          JSON.stringify({
            items: [
              {
                id: "video-1",
                externalId: "youtube-id",
                title: "Raora",
                durationMs: 60000,
              },
            ],
            nextCursor: null,
          }),
        );
      if (req.url === "/api/v1/videos/video-1")
        return res.end(
          JSON.stringify({
            id: "video-1",
            externalId: "youtube-id",
            title: "Raora",
            durationMs: 60000,
          }),
        );
      if (req.url === "/api/v1/videos/broken") {
        res.statusCode = 500;
        return res.end("{}");
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    process.env.HIGHLIGHT_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    videos = new VideosService({
      query: () => {
        throw new Error("Catalog adapter must not query/write own DB");
      },
    } as unknown as DatabaseService);
  });
  afterAll(async () => {
    await videos.onModuleDestroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  test("uses original /api/v1/videos contract and encodes cursor", async () => {
    expect(
      (await videos.list(20, 0, "abc&injected=true")).items[0].externalId,
    ).toBe("youtube-id");
    expect(seen[0]).toBe(
      "/api/v1/videos?limit=20&cursor=abc%26injected%3Dtrue",
    );
    expect((await videos.find("video-1")).durationMs).toBe(60000);
  });
  test("returns actionable 404/502 and prevents registration into original catalog", async () => {
    await expect(videos.find("missing")).rejects.toMatchObject({ status: 404 });
    await expect(videos.find("broken")).rejects.toMatchObject({ status: 502 });
    await expect(
      videos.register({ externalId: "id", title: "title" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  test("missing ffprobe gives actionable 503 instead of unhandled ENOENT", async () => {
    const before = process.env.FFPROBE_PATH;
    process.env.FFPROBE_PATH = "/missing-thumbnail-test/ffprobe";
    const extractor = new FrameExtractorService();
    if (before === undefined) delete process.env.FFPROBE_PATH;
    else process.env.FFPROBE_PATH = before;
    await expect(extractor.duration("unused.mp4")).rejects.toMatchObject({
      status: 503,
    });
  });
});
