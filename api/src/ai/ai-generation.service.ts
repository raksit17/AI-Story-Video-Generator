import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";
import sharp from "sharp";
import { DatabaseService } from "../database/database.service";
import { AssetsService } from "../media/assets.service";
import { VideosService } from "../videos/videos.service";
import { GenerateBackgroundDto } from "./ai.dto";
import { ComfyRejected, ComfyUiService } from "./comfyui.service";
export interface AiState {
  assets: any[];
  seeds: number[];
  promptId?: string;
  startedAt?: number;
  error?: string;
  message?: string;
}
export interface AiJob {
  id: string;
  videoId: string;
  requestId: string;
  status: string;
  input: GenerateBackgroundDto;
  state: AiState;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
}
const ACTIVE = ["queued", "submitting", "running"];
@Injectable()
export class AiGenerationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private task?: Promise<void>;
  private log = new Logger(AiGenerationService.name);
  private timeout = Math.max(
    60000,
    Math.min(3600000, Number(process.env.COMFYUI_JOB_TIMEOUT_MS) || 900000),
  );
  constructor(
    private db: DatabaseService,
    private assets: AssetsService,
    private videos: VideosService,
    private comfy: ComfyUiService,
  ) {}
  onModuleInit() {
    if (process.env.AI_QUEUE_ENABLED === "false") return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.task = this.pump().catch((e) =>
        this.log.error(`AI queue: ${e.message}. Check db:migrate and ComfyUI.`),
      );
    }, 2000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.task;
  }
  async create(videoId: string, input: GenerateBackgroundDto) {
    await this.videos.find(videoId);
    const existing = (
      await this.db.query<AiJob>(
        'SELECT * FROM thumbnail_editor.ai_jobs WHERE "requestId"=$1',
        [input.requestId],
      )
    ).rows[0];
    if (existing) {
      if (existing.videoId !== videoId)
        throw new ConflictException("requestId belongs to another video");
      return existing;
    }
    const id = randomUUID(),
      normalized = {
        ...input,
        seed: input.seed ?? randomInt(0, 2147483644),
        steps: input.steps ?? 22,
        cfg: input.cfg ?? 6,
        resolution: input.resolution ?? "standard",
      };
    const result = await this.db.query<AiJob>(
      `INSERT INTO thumbnail_editor.ai_jobs (id,"videoId","requestId",status,input,state) VALUES ($1,$2,$3,'queued',$4::jsonb,$5::jsonb) ON CONFLICT ("requestId") DO NOTHING RETURNING *`,
      [
        id,
        videoId,
        input.requestId,
        JSON.stringify(normalized),
        JSON.stringify({
          assets: [],
          seeds: [],
          message: "Waiting for ComfyUI",
        }),
      ],
    );
    if (result.rows[0]) return result.rows[0];
    const retry = (
      await this.db.query<AiJob>(
        'SELECT * FROM thumbnail_editor.ai_jobs WHERE "requestId"=$1',
        [input.requestId],
      )
    ).rows[0];
    if (!retry || retry.videoId !== videoId)
      throw new ConflictException("requestId already used");
    return retry;
  }
  async list(videoId: string) {
    return {
      items: (
        await this.db.query<AiJob>(
          'SELECT * FROM thumbnail_editor.ai_jobs WHERE "videoId"=$1 ORDER BY "createdAt" DESC LIMIT 30',
          [videoId],
        )
      ).rows,
    };
  }
  async get(videoId: string, id: string) {
    const job = (
      await this.db.query<AiJob>(
        'SELECT * FROM thumbnail_editor.ai_jobs WHERE id=$1 AND "videoId"=$2',
        [id, videoId],
      )
    ).rows[0];
    if (!job) throw new NotFoundException("AI job not found");
    return job;
  }
  async cancel(videoId: string, id: string) {
    await this.get(videoId, id);
    await this.db.query(
      "UPDATE thumbnail_editor.ai_jobs SET \"cancelRequested\"=true,\"updatedAt\"=now() WHERE id=$1 AND status IN ('queued','submitting','running')",
      [id],
    );
    return this.get(videoId, id);
  }
  private async save(job: AiJob) {
    await this.db.query(
      'UPDATE thumbnail_editor.ai_jobs SET status=$2,state=$3::jsonb,"updatedAt"=now() WHERE id=$1',
      [job.id, job.status, JSON.stringify(job.state)],
    );
  }
  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      await this.db.withAiQueueLock(async () => {
        await this.db.query(
          "UPDATE thumbnail_editor.ai_jobs SET status='cancelled',\"updatedAt\"=now() WHERE status='queued' AND \"cancelRequested\"=true",
        );
        const job = (
          await this.db.query<AiJob>(
            "SELECT * FROM thumbnail_editor.ai_jobs WHERE status IN ('queued','submitting','running') ORDER BY CASE WHEN status='queued' THEN 1 ELSE 0 END, \"createdAt\", id LIMIT 1",
          )
        ).rows[0];
        if (job) await this.advance(job);
      });
    } finally {
      this.running = false;
    }
  }
  private async advance(job: AiJob) {
    const state = job.state;
    // Persist submitting before sending. A crash in that window must never silently duplicate generation.
    if (job.status === "submitting") {
      job.status = "failed";
      state.error =
        "API restarted during submission. ComfyUI may have accepted the image; inspect its queue/history before generating a new job.";
      await this.save(job);
      return;
    }
    if (job.cancelRequested && job.status === "queued") {
      job.status = "cancelled";
      state.message = "Stopped before next image";
      await this.save(job);
      return;
    }
    if (job.status === "queued") {
      try {
        if (!(await this.comfy.idle())) {
          state.message = "Waiting for existing ComfyUI queue";
          await this.save(job);
          return;
        }
        const seed = job.input.seed! + state.assets.length;
        const graph = await this.comfy.workflow(job.input, seed, job.id);
        job.status = "submitting";
        state.startedAt = Date.now();
        state.error = undefined;
        await this.save(job);
        try {
          state.promptId = await this.comfy.submit(graph, job.id);
        } catch (error) {
          job.status = "failed";
          state.error =
            error instanceof ComfyRejected
              ? error.message
              : "Submission response unavailable. ComfyUI may have accepted it; inspect its queue/history before starting another job.";
          await this.save(job);
          return;
        }
        job.status = "running";
        state.message = `Generating image ${state.assets.length + 1}/${job.input.variations}`;
        await this.save(job);
      } catch (error) {
        // A DB failure after submission leaves persisted 'submitting', handled conservatively on recovery.
        if (job.status !== "queued") throw error;
        state.error =
          "Cannot reach ComfyUI or load workflow. Check COMFYUI_URL and workflows folder.";
        await this.save(job);
      }
      return;
    }
    if (Date.now() - (state.startedAt ?? 0) > this.timeout) {
      job.status = "failed";
      state.error =
        "Generation timed out. ComfyUI may still be running. Completed images are retained; no automatic resubmission.";
      await this.save(job);
      return;
    }
    const originalState = structuredClone(state);
    let imported: string | undefined;
    try {
      const history = await this.comfy.history(state.promptId!);
      if (!history) {
        state.message = "Waiting for ComfyUI history";
        state.error = undefined;
        await this.save(job);
        return;
      }
      if (
        history.status?.status_str === "error" ||
        history.status?.messages?.some((m: any[]) =>
          ["execution_error", "execution_interrupted"].includes(m[0]),
        )
      ) {
        job.status = "failed";
        state.error =
          "ComfyUI execution failed or was interrupted. Check its console (checkpoint / CUDA memory).";
        await this.save(job);
        return;
      }
      if (!history.status?.completed) return;
      const output = history.outputs?.["9"]?.images?.[0];
      if (!output)
        throw new ComfyRejected(
          "Completed workflow has no SaveImage node 9 output",
        );
      const bytes = await this.comfy.image(output);
      let png: Buffer;
      try {
        const meta = await sharp(bytes, {
          limitInputPixels: 24000000,
        }).metadata();
        if (
          !["png", "jpeg"].includes(meta.format ?? "") ||
          (meta.pages ?? 1) > 1
        )
          throw new Error("Invalid format");
        png = await sharp(bytes, { limitInputPixels: 24000000 })
          .resize(1280, 720, { fit: "cover" })
          .png()
          .toBuffer();
      } catch {
        throw new ComfyRejected(
          "ComfyUI output is not a valid single PNG/JPEG",
        );
      }
      const asset = await this.assets.upload(
        job.videoId,
        { buffer: png } as Express.Multer.File,
        "image",
      );
      imported = asset.id;
      state.assets.push(asset);
      state.seeds.push(job.input.seed! + state.seeds.length);
      state.promptId = undefined;
      state.error = undefined;
      const fresh = await this.get(job.videoId, job.id);
      job.status = fresh.cancelRequested
        ? "cancelled"
        : state.assets.length >= job.input.variations
          ? "completed"
          : "queued";
      state.message =
        job.status === "queued"
          ? "Waiting for next image"
          : job.status === "completed"
            ? "Completed"
            : "Stopped; completed images retained";
      await this.save(job);
    } catch (error) {
      if (imported) {
        await this.assets.deleteGenerated(imported).catch(() => {});
        job.state = originalState;
        job.status = "running";
      }
      const failureState = job.state;
      if (error instanceof ComfyRejected) {
        job.status = "failed";
        failureState.error = error.message;
      } else {
        failureState.error =
          "Could not read/store ComfyUI result; retrying until job timeout.";
      }
      // Do not persist mutated state after a failed asset/job commit; next tick reloads DB and retries.
      if (job.status === "running" || error instanceof ComfyRejected)
        await this.save(job);
      else throw error;
    }
  }
}
