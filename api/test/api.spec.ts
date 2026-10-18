import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { newDb } from "pg-mem";
import { readFile, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import request from "supertest";
import sharp from "sharp";
import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";
import { FrameExtractorService } from "../src/media/frame-extractor.service";
import { setup } from "../src/setup";
jest.setTimeout(30000);
describe("Thumbnail HTTP API + real FFmpeg", () => {
  let app: NestExpressApplication,
    dir: string,
    videoId: string,
    frameId: string,
    draftId: string;
  let pool: any;
  const document = {
    version: 1,
    width: 1280,
    height: 720,
    backgroundColor: "#102030",
    elements: [
      {
        id: "title",
        type: "text",
        x: 80,
        y: 300,
        width: 1000,
        height: 160,
        text: "กรี๊ดลั่น!! ใครอยู่ข้างหลัง!?",
        fontSize: 90,
        fill: "#FFD700",
        stroke: "#000000",
        strokeWidth: 6,
      },
    ],
  };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "thumbnail-test-"));
    await mkdir(join(dir, "sources"));
    process.env.AI_QUEUE_ENABLED = "false";
    process.env.DATABASE_URL = "postgresql://unused:unused@localhost/test";
    process.env.VIDEO_CATALOG_MODE = "local";
    process.env.VIDEO_SOURCE_DIR = join(dir, "sources");
    process.env.STORAGE_DIR = join(dir, "storage");
    process.env.STORY_STORAGE_DIR = join(dir, "stories");
    process.env.API_KEY = "test-secret";
    process.env.HOST = "127.0.0.1";
    const memory = newDb();
    memory.public.none(
      await readFile(join(__dirname, "../scripts/schema.sql"), "utf8"),
    );
    const Pg = memory.adapters.createPg();
    pool = new Pg.Pool();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        query: (sql: string, values: unknown[]) => pool.query(sql, values),
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    setup(app);
    await app.init();
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=10",
      "-t",
      "2",
      "-c:v",
      "mpeg4",
      "-y",
      join(dir, "sources", "raora-test.mp4"),
    ]);
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await rm(dir, { recursive: true, force: true });
  });
  function get(path: string) {
    return request(app.getHttpServer())
      .get("/api/v1" + path)
      .set("X-API-Key", "test-secret");
  }
  function post(path: string) {
    return request(app.getHttpServer())
      .post("/api/v1" + path)
      .set("X-API-Key", "test-secret");
  }
  test("health, auth and CORS preflight", async () => {
    await request(app.getHttpServer()).get("/api/v1/health").expect(401);
    await get("/health").expect(200);
    const res = await request(app.getHttpServer())
      .options("/api/v1/videos")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .expect(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
  test("save, list, reload and update multiple persistent story projects", async () => {
    const first = await post("/stories")
      .send({ title: "เรื่องแรก", prompt: "A story", scenes: [{ id: "scene-a", title: "เปิดเรื่อง" }] })
      .expect(201);
    const second = await post("/stories")
      .send({ title: "เรื่องที่สอง", prompt: "Another story", scenes: [] })
      .expect(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect((await get("/stories")).body.items).toHaveLength(2);
    expect((await get(`/stories/${first.body.id}`)).body.scenes[0].title).toBe("เปิดเรื่อง");
    await request(app.getHttpServer())
      .put(`/api/v1/stories/${first.body.id}`)
      .set("X-API-Key", "test-secret")
      .send({ title: "แก้ไขแล้ว", scenes: [] })
      .expect(200);
    expect((await get(`/stories/${first.body.id}`)).body.title).toBe("แก้ไขแล้ว");
  });
  test("save reusable character profiles with image references and proxy MOSS voice profiles", async () => {
    const saved = await post("/stories/character-profiles")
      .send({ name: "ลูน่า", description: "ผมสีเงิน ดวงตาสีฟ้า", referenceData: "data:image/png;base64,iVBORw0KGgo=", voiceId: "voice-luna" })
      .expect(201);
    expect(saved.body.referenceUrl).toContain("/stories/assets/");
    expect((await get("/stories/character-profiles")).body.items[0].id).toBe(saved.body.id);
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "voice-luna", name: "Luna", language: "Thai" }] }), { status: 200 }),
    );
    try {
      expect((await get("/stories/voice-profiles")).body.items[0].id).toBe("voice-luna");
      expect(fetchSpy.mock.calls[0][0]).toBe("http://127.0.0.1:8001/v1/voices");
      expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get("X-API-Key")).toBe("local-dev-key");
    } finally { fetchSpy.mockRestore(); }
  });
  test("register, list and retrieve videos", async () => {
    const res = await post("/videos")
      .send({ externalId: "raora-test", title: "Raora highlight" })
      .expect(201);
    videoId = res.body.id;
    expect((await get("/videos")).body.items[0].id).toBe(videoId);
    await get("/videos/" + videoId).expect(200);
    await post("/videos")
      .send({ externalId: "raora-test", title: "Duplicate" })
      .expect(409);
    await post("/videos")
      .send({ externalId: "../escape", title: "Invalid" })
      .expect(400);
    await get("/videos?limit=NaN").expect(400);
  });
  test("reject malformed timestamps, extras and out-of-duration frames", async () => {
    for (const payload of [
      { timestampsMs: [-1] },
      { timestampsMs: [0.2] },
      { timestampsMs: [] },
      { timestampsMs: [0], path: "/etc/passwd" },
      { timestampsMs: [2000] },
    ]) {
      await post(`/videos/${videoId}/thumbnails/frames`)
        .send(payload)
        .expect(400);
    }
  });
  test("extract real source frames, deduplicate timestamps, serve exact 1280x720 JPEG", async () => {
    const res = await post(`/videos/${videoId}/thumbnails/frames`)
      .send({ timestampsMs: [1000, 0, 1000] })
      .expect(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((f: any) => f.timestampMs)).toEqual([0, 1000]);
    frameId = res.body.items[0].id;
    const image = await get(`/assets/${frameId}/file`).expect(200);
    const info = await sharp(image.body).metadata();
    expect([info.width, info.height, info.format]).toEqual([1280, 720, "jpeg"]);
    expect(
      (await get(`/videos/${videoId}/thumbnails/frames`)).body.items,
    ).toHaveLength(2);
  });
  test("reject invalid crop DTO before invoking worker", async () => {
    for (const payload of [
      { sourceAssetId: frameId },
      {
        sourceAssetId: frameId,
        crop: { x: -1, y: 0, width: 100, height: 100 },
      },
      {
        sourceAssetId: frameId,
        crop: { x: 0, y: 0, width: 2049, height: 100 },
      },
      {
        sourceAssetId: frameId,
        crop: { x: 0.5, y: 0, width: 100, height: 100 },
      },
      {
        sourceAssetId: frameId,
        crop: { x: 0, y: 0, width: 100, height: 100 },
        path: "/etc/passwd",
      },
    ])
      await post(`/videos/${videoId}/thumbnails/remove-background`)
        .send(payload)
        .expect(400);
  });
  test("AI routes validate inputs and scope persisted jobs to their video", async () => {
    const payload = {
      requestId: "8ee09ab0-144d-4dcb-8869-7514b8090444",
      style: "horror",
      prompt: "Abandoned hospital",
      variations: 3,
    };
    for (const invalid of [
      { ...payload, variations: 4 },
      { ...payload, style: "unknown" },
      { ...payload, steps: 500 },
      { ...payload, workflow: {} },
      { ...payload, requestId: "bad" },
    ])
      await post(`/videos/${videoId}/thumbnails/ai-backgrounds`)
        .send(invalid)
        .expect(400);
    const created = await post(`/videos/${videoId}/thumbnails/ai-backgrounds`)
      .send(payload)
      .expect(202);
    expect(created.body.status).toBe("queued");
    const duplicate = await post(`/videos/${videoId}/thumbnails/ai-backgrounds`)
      .send(payload)
      .expect(202);
    expect(duplicate.body.id).toBe(created.body.id);
    await get(
      `/videos/another/thumbnails/ai-backgrounds/${created.body.id}`,
    ).expect(404);
    expect(
      (await get(`/videos/${videoId}/thumbnails/ai-backgrounds`)).body.items,
    ).toHaveLength(1);
    expect(
      (
        await get(
          `/videos/${videoId}/thumbnails/ai-backgrounds/${created.body.id}/images`,
        )
      ).body.items,
    ).toEqual([]);
    const cancelled = await post(
      `/videos/${videoId}/thumbnails/ai-backgrounds/${created.body.id}/cancel`,
    ).expect(201);
    expect(cancelled.body.cancelRequested).toBe(true);
  });
  test("round-trip Thai draft and optimistic revision conflict", async () => {
    const res = await post(`/videos/${videoId}/thumbnails/drafts`)
      .send({
        name: "ปก Raora",
        document: { ...document, backgroundAssetId: frameId },
      })
      .expect(201);
    draftId = res.body.id;
    expect(res.body.document.elements[0].text).toBe(document.elements[0].text);
    const payload = { name: "ปกใหม่", document, revision: 1 };
    await request(app.getHttpServer())
      .put(`/api/v1/videos/${videoId}/thumbnails/drafts/${draftId}`)
      .set("X-API-Key", "test-secret")
      .send(payload)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/videos/${videoId}/thumbnails/drafts/${draftId}`)
      .set("X-API-Key", "test-secret")
      .send(payload)
      .expect(409);
    expect(
      (await get(`/videos/${videoId}/thumbnails/drafts/${draftId}`)).body
        .revision,
    ).toBe(2);
  });
  test("reject missing document, invalid element types and assets from another video", async () => {
    await post(`/videos/${videoId}/thumbnails/drafts`)
      .send({ name: "Missing" })
      .expect(400);
    await post(`/videos/${videoId}/thumbnails/drafts`)
      .send({
        name: "Invalid",
        document: {
          ...document,
          elements: [{ ...document.elements[0], type: "image" }],
        },
      })
      .expect(400);
    const other = await post("/videos")
      .send({ externalId: "other", title: "Other video" })
      .expect(201);
    await post(`/videos/${other.body.id}/thumbnails/drafts`)
      .send({
        name: "Wrong owner",
        document: { ...document, backgroundAssetId: frameId },
      })
      .expect(400);
  });
  test("upload transparent PNG and enforce valid export format and size", async () => {
    const image = await sharp({
      create: { width: 100, height: 100, channels: 4, background: "#ff000080" },
    })
      .png()
      .toBuffer();
    const upload = await post(`/videos/${videoId}/thumbnails/images`)
      .attach("file", image, "character.png")
      .expect(201);
    const saved = await get(`/assets/${upload.body.id}/file?download=1`).expect(
      200,
    );
    expect((await sharp(saved.body).metadata()).hasAlpha).toBe(true);
    await post(`/videos/${videoId}/thumbnails/images`)
      .attach("file", Buffer.from("<svg></svg>"), "fake.png")
      .expect(400);
    await post(`/videos/${videoId}/thumbnails/exports`)
      .attach("file", image, "wrong-size.png")
      .expect(400);
    const jpg = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: "#ffaa00" },
    })
      .jpeg()
      .toBuffer();
    const exported = await post(`/videos/${videoId}/thumbnails/exports`)
      .attach("file", jpg, "thumbnail.jpg")
      .expect(201);
    expect(exported.body.kind).toBe("export");
    const downloaded = await get(
      `/assets/${exported.body.id}/file?download=1`,
    ).expect(200);
    expect(downloaded.headers["content-disposition"]).toContain("attachment");
  });
  test("reject symlink sources outside configured root", async () => {
    if (process.platform === "win32") return;
    const outside = join(dir, "outside.mp4");
    await import("node:fs/promises").then((fs) =>
      fs.copyFile(join(dir, "sources", "raora-test.mp4"), outside),
    );
    await symlink(outside, join(dir, "sources", "escape.mp4"));
    await expect(
      app.get(FrameExtractorService).source({
        id: "escape",
        externalId: "escape",
        title: "",
        durationMs: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  test("delete respects revision and removes draft", async () => {
    const path = `/api/v1/videos/${videoId}/thumbnails/drafts/${draftId}`;
    await request(app.getHttpServer())
      .delete(path + "?revision=1")
      .set("X-API-Key", "test-secret")
      .expect(409);
    await request(app.getHttpServer())
      .delete(path + "?revision=2")
      .set("X-API-Key", "test-secret")
      .expect(200);
    await get(`/videos/${videoId}/thumbnails/drafts/${draftId}`).expect(404);
  });
});
