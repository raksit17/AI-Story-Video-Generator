import "reflect-metadata";
import { newDb } from "pg-mem";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { AssetsService } from "../src/media/assets.service";
import { AiGenerationService } from "../src/ai/ai-generation.service";
import { ComfyUiService } from "../src/ai/comfyui.service";
import { GenerateBackgroundDto } from "../src/ai/ai.dto";
describe("Durable AI queue + real HTTP ComfyUI contract fixture", () => {
  let pool: any,
    db: any,
    assets: AssetsService,
    comfy: ComfyUiService,
    jobs: AiGenerationService,
    server: Server,
    dir: string;
  let mode: string,
    posted: any[],
    history: Record<string, any>,
    queueBusy: boolean,
    png: Buffer;
  const input = (): GenerateBackgroundDto => ({
    requestId: randomUUID(),
    style: "horror",
    prompt: "Haunted corridor",
    variations: 3,
    seed: 42,
  });
  const worker = () =>
    new AiGenerationService(
      db,
      assets,
      { find: async () => ({ id: "video" }) } as any,
      comfy,
    );
  beforeAll(async () => {
    png = await sharp({
      create: { width: 768, height: 448, channels: 3, background: "#662288" },
    })
      .png()
      .toBuffer();
    server = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/queue") {
        res.end(
          JSON.stringify({
            queue_running: queueBusy ? [[1, "other"]] : [],
            queue_pending: [],
          }),
        );
        return;
      }
      if (req.url === "/object_info/CheckpointLoaderSimple") {
        res.end(
          JSON.stringify({
            CheckpointLoaderSimple: {
              input: {
                required: { ckpt_name: [["sd_xl_base_1.0.safetensors"]] },
              },
            },
          }),
        );
        return;
      }
      if (req.url === "/prompt") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        posted.push(body);
        if (mode === "reject") {
          res.statusCode = 400;
          res.end("{}");
          return;
        }
        if (mode === "lost") {
          req.socket.destroy();
          return;
        }
        const id = randomUUID();
        history[id] = {
          status: {
            completed: mode !== "pending",
            status_str: mode === "error" ? "error" : "success",
          },
          outputs: {
            "9": {
              images: [
                {
                  filename: "result.png",
                  subfolder: "HoloMoment",
                  type: "output",
                },
              ],
            },
          },
        };
        res.end(JSON.stringify({ prompt_id: id, node_errors: {} }));
        return;
      }
      if (req.url?.startsWith("/history/")) {
        const id = req.url.split("/").pop()!;
        res.end(JSON.stringify(history[id] ? { [id]: history[id] } : {}));
        return;
      }
      if (req.url?.startsWith("/view?")) {
        res.setHeader("Content-Type", "image/png");
        res.end(mode === "bad-image" ? Buffer.from("not an image") : png);
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    process.env.COMFYUI_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    mode = "ok";
    posted = [];
    history = {};
    queueBusy = false;
    dir = await mkdtemp(join(tmpdir(), "thumbnail-ai-"));
    process.env.DATABASE_URL = "postgresql://unused:unused@localhost/test";
    process.env.STORAGE_DIR = dir;
    const memory = newDb();
    memory.public.none(
      await readFile(join(__dirname, "../scripts/schema.sql"), "utf8"),
    );
    const Pg = memory.adapters.createPg();
    pool = new Pg.Pool();
    let locked = false;
    db = {
      query: (sql: string, values: unknown[]) => pool.query(sql, values),
      withAiQueueLock: async (fn: () => Promise<void>) => {
        if (locked) return;
        locked = true;
        try {
          await fn();
        } finally {
          locked = false;
        }
      },
    };
    assets = new AssetsService(db);
    comfy = new ComfyUiService();
    jobs = worker();
  });
  afterEach(async () => {
    await pool.end();
    await rm(dir, { recursive: true, force: true });
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    delete process.env.COMFYUI_URL;
  });
  it("creates one durable request and generates 3 sequential images with different seeds", async () => {
    const dto = input(),
      job = await jobs.create("video", dto);
    expect((await jobs.create("video", dto)).id).toBe(job.id);
    await jobs.pump();
    expect(posted).toHaveLength(1);
    expect((await jobs.get("video", job.id)).status).toBe("running");
    for (let i = 0; i < 5; i++) await jobs.pump();
    const result = await jobs.get("video", job.id);
    expect(result.status).toBe("completed");
    expect(result.state.assets).toHaveLength(3);
    expect(result.state.seeds).toEqual([42, 43, 44]);
    expect(posted.map((p) => p.prompt["3"].inputs.seed)).toEqual([42, 43, 44]);
    expect(posted[0].prompt["5"].inputs.batch_size).toBe(1);
    for (const a of result.state.assets) {
      const file = await assets.file(a.id);
      const meta = await sharp(file.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([1280, 720]);
    }
  });
  it("resumes existing prompt after service restart without submitting again", async () => {
    const job = await jobs.create("video", { ...input(), variations: 1 });
    await jobs.pump();
    jobs = worker();
    await jobs.pump();
    expect((await jobs.get("video", job.id)).status).toBe("completed");
    expect(posted).toHaveLength(1);
  });
  it("marks an uncertain submission failed instead of automatically repeating", async () => {
    mode = "lost";
    const job = await jobs.create("video", input());
    await jobs.pump();
    await jobs.pump();
    expect(posted).toHaveLength(1);
    expect((await jobs.get("video", job.id)).status).toBe("failed");
  });
  it("recovers a crash in submitting state without another POST", async () => {
    const job = await jobs.create("video", input());
    await db.query(
      "UPDATE thumbnail_editor.ai_jobs SET status='submitting' WHERE id=$1",
      [job.id],
    );
    await jobs.pump();
    expect((await jobs.get("video", job.id)).status).toBe("failed");
    expect(posted).toHaveLength(0);
  });
  it("cancels queued jobs and stops running jobs only after importing current image", async () => {
    const queued = await jobs.create("video", input());
    await jobs.cancel("video", queued.id);
    await jobs.pump();
    expect((await jobs.get("video", queued.id)).status).toBe("cancelled");
    expect(posted).toHaveLength(0);
    const running = await jobs.create("video", input());
    await jobs.pump();
    await jobs.cancel("video", running.id);
    await jobs.pump();
    const result = await jobs.get("video", running.id);
    expect(result.status).toBe("cancelled");
    expect(result.state.assets).toHaveLength(1);
    expect(posted).toHaveLength(1);
  });
  it.each(["reject", "error", "bad-image"])(
    "retains failure state for %s",
    async (value) => {
      mode = value;
      const job = await jobs.create("video", input());
      await jobs.pump();
      await jobs.pump();
      const result = await jobs.get("video", job.id);
      expect(result.status).toBe("failed");
      expect(result.state.assets).toHaveLength(0);
    },
  );
  it("waits for external ComfyUI work and rejects cross-video job access", async () => {
    queueBusy = true;
    const job = await jobs.create("video", input());
    await jobs.pump();
    expect(posted).toHaveLength(0);
    await expect(jobs.get("other", job.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      jobs.create("other", { ...input(), requestId: job.requestId }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("expires a running prompt without resending and retains prompt id for inspection", async () => {
    mode = "pending";
    const job = await jobs.create("video", input());
    await jobs.pump();
    const result = await jobs.get("video", job.id);
    result.state.startedAt = 1;
    await db.query(
      "UPDATE thumbnail_editor.ai_jobs SET state=$2::jsonb WHERE id=$1",
      [job.id, JSON.stringify(result.state)],
    );
    await jobs.pump();
    expect((await jobs.get("video", job.id)).status).toBe("failed");
    expect(posted).toHaveLength(1);
  });
  it("serializes competing workers sharing the same database lock", async () => {
    await jobs.create("video", input());
    const other = worker();
    await Promise.all([jobs.pump(), other.pump(), jobs.pump()]);
    expect(posted).toHaveLength(1);
  });
  it("retries asset storage failures against the same prompt without new generation", async () => {
    const job = await jobs.create("video", { ...input(), variations: 1 });
    await jobs.pump();
    const spy = jest
      .spyOn(assets, "upload")
      .mockRejectedValueOnce(new Error("disk full"));
    await jobs.pump();
    expect((await jobs.get("video", job.id)).status).toBe("running");
    await jobs.pump();
    expect((await jobs.get("video", job.id)).status).toBe("completed");
    expect(posted).toHaveLength(1);
    spy.mockRestore();
  });
  it("rejects output path traversal and builds a low-memory workflow with no character nodes", async () => {
    await expect(
      comfy.image({ filename: "../secret.png", type: "output" }),
    ).rejects.toThrow("Invalid");
    const graph = await comfy.workflow(
      { ...input(), resolution: "low" },
      7,
      "job",
    );
    expect(graph["5"].inputs).toMatchObject({
      width: 768,
      height: 448,
      batch_size: 1,
    });
    expect(graph["6"].inputs.text).toContain("background only");
    expect(await comfy.health()).toMatchObject({ checkpointAvailable: true });
  });
});
