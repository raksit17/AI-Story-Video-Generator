import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { outputImage, promptHistory, recoverPreviousOutput, retrieveComfyPng, type ComfyImage } from "./comfy-story-client";

type Story = Record<string, unknown> & { id: string; updatedAt: string };

@Injectable()
export class StoriesService {
  private readonly root = resolve(process.env.STORY_STORAGE_DIR ?? "./storage/stories");

  async providers() {
    const comfy = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
    let comfyAvailable = false;
    try {
      const response = await fetch(`${comfy}/queue`, { signal: AbortSignal.timeout(2500) });
      comfyAvailable = response.ok;
    } catch { /* Provider is optional until configured. */ }
    return {
      story: { configured: Boolean(process.env.OPENAI_API_KEY), provider: "OpenAI" },
      image: { configured: comfyAvailable, provider: "ComfyUI" },
      voice: { configured: Boolean(process.env.MOSS_API_URL), provider: "MOSS Voice Studio" },
      render: { configured: await this.ffmpegAvailable(), provider: "FFmpeg" },
      youtube: { configured: this.youtubeConfigured(), provider: "YouTube Data API" },
    };
  }

  youtubeConfigured() { return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REDIRECT_URI); }

  async youtubeStatus() {
    if (!this.youtubeConfigured()) return { configured:false, connected:false };
    try { await access(this.youtubeTokenPath()); return { configured:true, connected:true }; }
    catch { return { configured:true, connected:false }; }
  }

  async youtubeConnectUrl() {
    if (!this.youtubeConfigured()) throw new ServiceUnavailableException("Set YouTube OAuth client ID, secret, and redirect URI");
    const state = randomUUID();
    await mkdir(this.root,{recursive:true});
    await writeFile(join(this.root,`oauth-state-${state}.json`),JSON.stringify({createdAt:Date.now()}),{mode:0o600});
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id:process.env.YOUTUBE_CLIENT_ID!, redirect_uri:process.env.YOUTUBE_REDIRECT_URI!, response_type:"code", scope:"https://www.googleapis.com/auth/youtube.upload", access_type:"offline", prompt:"consent", state }).toString();
    return { url:url.toString() };
  }

  async youtubeCallback(code: string, state: string) {
    if (!this.youtubeConfigured()) throw new ServiceUnavailableException("YouTube OAuth is not configured");
    const stateFile = join(this.root,`oauth-state-${state}.json`);
    try {
      const savedState = JSON.parse(await readFile(stateFile,"utf8"));
      if (Date.now()-Number(savedState.createdAt)>10*60*1000) throw new Error("expired");
    } catch { throw new BadRequestException("OAuth state is invalid or expired"); }
    const { rm } = await import("node:fs/promises"); await rm(stateFile,{force:true});
    const response = await fetch("https://oauth2.googleapis.com/token",{ method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:process.env.YOUTUBE_CLIENT_ID!,client_secret:process.env.YOUTUBE_CLIENT_SECRET!,redirect_uri:process.env.YOUTUBE_REDIRECT_URI!,grant_type:"authorization_code"}),signal:AbortSignal.timeout(20000) });
    if (!response.ok) throw new ServiceUnavailableException("Google OAuth token exchange failed");
    const token = await response.json() as Record<string,any>;
    if (!token.refresh_token) throw new ServiceUnavailableException("Google did not return a refresh token; reconnect and grant offline access");
    await mkdir(this.root,{recursive:true});
    await writeFile(this.youtubeTokenPath(),JSON.stringify({...token,expires_at:Date.now()+Number(token.expires_in||3600)*1000}),{mode:0o600});
    return { connected:true };
  }

  async uploadYoutube(story: Story, privacy: string) {
    if (!["private","unlisted","public"].includes(privacy)) throw new BadRequestException("Privacy must be private, unlisted, or public");
    const videoPath = this.assetFromUrl(story.videoUrl,"mp4");
    if (!videoPath) throw new BadRequestException("Render an MP4 before uploading");
    await access(videoPath);
    const token = await this.youtubeAccessToken();
    const status: Record<string,unknown> = { privacyStatus:privacy };
    if (typeof story.syntheticMedia === "boolean") status.containsSyntheticMedia = story.syntheticMedia;
    const metadata = { snippet:{title:String(story.title||story.name||"AI Story Video").slice(0,100),description:String(story.description||"").slice(0,5000),tags:String(story.tags||"").split(",").map((x)=>x.trim()).filter(Boolean).slice(0,500),categoryId:"24"},status };
    const size = (await import("node:fs/promises")).stat(videoPath).then((s)=>s.size);
    const length = await size;
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":"video/mp4","X-Upload-Content-Length":String(length)},body:JSON.stringify(metadata),signal:AbortSignal.timeout(30000)});
    if (!init.ok) throw new ServiceUnavailableException(`YouTube upload initialization failed (${init.status})`);
    const location = init.headers.get("location");
    if (!location) throw new ServiceUnavailableException("YouTube did not provide a resumable upload URL");
    const result = await fetch(location,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"video/mp4","Content-Length":String(length),"Content-Range":`bytes 0-${length-1}/${length}`},body:new Uint8Array(await readFile(videoPath)),signal:AbortSignal.timeout(15*60*1000)});
    if (!result.ok) throw new ServiceUnavailableException(`YouTube upload failed (${result.status})`);
    const uploaded = await result.json() as any;
    let thumbnailApplied = false;
    let thumbnailError: string | undefined;
    if (typeof story.thumbnailUrl === "string") {
      const thumbnail = this.assetFromUrl(story.thumbnailUrl,"image");
      if (thumbnail) {
        const image = await readFile(thumbnail);
        const thumbResponse = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(uploaded.id)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":String(story.thumbnailMime||"image/png"),"Content-Length":String(image.byteLength)},body:new Uint8Array(image),signal:AbortSignal.timeout(60000)});
        if (!thumbResponse.ok) thumbnailError=`Video uploaded, but the thumbnail update failed (${thumbResponse.status})`;
        else thumbnailApplied=true;
      }
    }
    return { videoId:uploaded.id, url:`https://www.youtube.com/watch?v=${encodeURIComponent(uploaded.id)}`, privacyStatus:uploaded.status?.privacyStatus, thumbnailApplied, thumbnailError };
  }

  async saveThumbnail(story: Story, dataUrl: string) {
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new BadRequestException("Thumbnail must be a PNG or JPEG image");
    const buffer = Buffer.from(match[2],"base64");
    if (!buffer.length || buffer.length > 8*1024*1024) throw new BadRequestException("Thumbnail must be at most 8 MB");
    await mkdir(this.root,{recursive:true});
    const id = randomUUID(); const ext = match[1] === "image/png" ? "png" : "jpg";
    await writeFile(join(this.root,`${id}.${ext}`),buffer);
    story.thumbnailUrl = `/api/v1/stories/assets/${id}.${ext}`;
    story.thumbnailMime = match[1];
    await this.save(story,story.id);
    return { url:story.thumbnailUrl };
  }

  async saveMusic(story: Story, dataUrl: string) {
    const match = dataUrl.match(/^data:(audio\/(?:mpeg|wav|x-wav|mp4|ogg|webm));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new BadRequestException("Music must be MP3, WAV, M4A, OGG, or WebM audio");
    const buffer=Buffer.from(match[2],"base64");
    if (!buffer.length || buffer.length>8*1024*1024) throw new BadRequestException("Music file must be at most 8 MB");
    const ext:Record<string,string>={"audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm"};
    await mkdir(this.root,{recursive:true}); const id=randomUUID();
    await writeFile(join(this.root,`${id}.${ext[match[1]]}`),buffer);
    story.musicUrl=`/api/v1/stories/assets/${id}.${ext[match[1]]}`;
    await this.save(story,story.id);
    return {url:story.musicUrl};
  }

  async list() {
    await mkdir(this.root, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(this.root)).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name));
    const items = await Promise.all(files.map((name) => this.read(name.slice(0, -5))));
    return { items: items.filter(Boolean).sort((a, b) => String(b!.updatedAt).localeCompare(String(a!.updatedAt))) };
  }

  async get(id: string): Promise<Story | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return this.read(id);
  }

  private characterRoot() { return join(this.root, "characters"); }

  async listCharacters() {
    const dir = this.characterRoot();
    await mkdir(dir, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(dir)).filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name));
    const items = await Promise.all(files.map(async (name) => {
      try { return JSON.parse(await readFile(join(dir, name), "utf8")); } catch { return null; }
    }));
    return { items: items.filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) };
  }

  async saveCharacter(input: Record<string, unknown>, id?: string) {
    const profileId = id ?? randomUUID();
    if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new BadRequestException("Invalid character profile ID");
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 2000) : "";
    if (!name || !description) throw new BadRequestException("Character name and appearance are required");
    const dir = this.characterRoot();
    await mkdir(dir, { recursive: true });
    const previous = await this.readCharacter(profileId);
    let referenceUrl = previous?.referenceUrl ?? null;
    if (typeof input.referenceData === "string" && input.referenceData) {
      const match = input.referenceData.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new BadRequestException("Reference image must be PNG or JPEG");
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new BadRequestException("Reference image must be at most 8 MB");
      const validPng = match[1] === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const validJpeg = match[1] === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!validPng && !validJpeg) throw new BadRequestException("Reference image data does not match its PNG/JPEG type");
      const ext = match[1] === "image/png" ? "png" : "jpg";
      const imageId = randomUUID();
      await writeFile(join(this.root, `${imageId}.${ext}`), bytes);
      referenceUrl = `/api/v1/stories/assets/${imageId}.${ext}`;
    } else if (typeof input.referenceUrl === "string") {
      referenceUrl = input.referenceUrl;
    }
    const profile = {
      id: profileId, name, description, referenceUrl,
      voiceId: typeof input.voiceId === "string" ? input.voiceId : previous?.voiceId ?? null,
      createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await writeFile(join(dir, `${profileId}.json`), JSON.stringify(profile, null, 2), "utf8");
    return profile;
  }

  async deleteCharacter(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("Invalid character profile ID");
    const profile = await this.readCharacter(id);
    if (!profile) return { deleted: false };
    const { rm } = await import("node:fs/promises");
    await rm(join(this.characterRoot(), `${id}.json`), { force: true });
    return { deleted: true };
  }

  private async readCharacter(id: string): Promise<any | null> {
    try { return JSON.parse(await readFile(join(this.characterRoot(), `${id}.json`), "utf8")); } catch { return null; }
  }

  private mossBase() { return (process.env.MOSS_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, ""); }

  private async mossRequest(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("X-API-Key", process.env.MOSS_API_KEY ?? "local-dev-key");
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    let response: Response;
    try { response = await fetch(`${this.mossBase()}${path}`, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(30000) }); }
    catch (error) { throw new ServiceUnavailableException(`MOSS Voice Studio is unreachable: ${String(error)}`); }
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new ServiceUnavailableException(`MOSS Voice Studio returned ${response.status}: ${message.slice(0, 240)}`);
    }
    return response;
  }

  async listMossVoices() {
    const response = await this.mossRequest("/v1/voices");
    return response.json();
  }

  async save(input: Record<string, unknown>, id: string = randomUUID()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("Invalid story ID");
    await mkdir(this.root, { recursive: true });
    const storyInput = structuredClone(input) as Record<string, any>;
    // Do not let a browser save overwrite the server-owned ComfyUI job state.
    const savedStory = await this.read(id);
    const savedScenes = (savedStory?.scenes as Array<Record<string, any>> | undefined) ?? [];
    for (const scene of storyInput.scenes ?? []) {
      const old = savedScenes.find((previous) => previous.id === scene.id);
      if (!Object.prototype.hasOwnProperty.call(scene, "imageJob")) {
        scene.imageJob = old?.imageJob ?? null;
      }
      if (!scene.imageUrl && old?.imageUrl) scene.imageUrl = old.imageUrl;
      if (!Object.prototype.hasOwnProperty.call(scene, "voiceJob")) scene.voiceJob = old?.voiceJob ?? null;
      if (!scene.audioUrl && old?.audioUrl) scene.audioUrl = old.audioUrl;
    }
    delete storyInput.thumbnailData;
    delete storyInput.musicData;
    for (const scene of storyInput.scenes ?? []) {
      delete scene.imageData;
      delete scene.audioData;
    }
    for (const character of storyInput.characters ?? []) delete character.imageData;
    const story = { ...storyInput, id, updatedAt: new Date().toISOString() } as Story;
    const target = join(this.root, `${id}.json`);
    const temp = `${target}.tmp`;
    await writeFile(temp, JSON.stringify(story, null, 2), "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(temp, target);
    return story;
  }

  async generateStoryboard(input: Record<string, unknown>) {
    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (prompt.length < 8 || prompt.length > 4000) throw new BadRequestException("Prompt must be between 8 and 4000 characters");
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ServiceUnavailableException("Set OPENAI_API_KEY to enable story generation");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.STORY_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Create a concise original video story. Return only JSON with keys title, synopsis, characters, scenes. characters must be an array of {name, role, appearance}. scenes must be an array of 4 to 12 {title, narration, imagePrompt, duration, motion, subtitle}. Keep all writing in the requested language. Keep character appearance consistent in every imagePrompt. Never imitate named copyrighted characters or living artists." },
          { role: "user", content: JSON.stringify({ prompt, genre: input.genre, artStyle: input.artStyle, language: input.language, duration: input.duration, aspect: input.aspect }) },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Story provider returned ${response.status}`);
    const payload = await response.json() as any;
    let result: any;
    try { result = JSON.parse(payload.choices?.[0]?.message?.content ?? ""); }
    catch { throw new ServiceUnavailableException("Story provider returned invalid JSON"); }
    if (!Array.isArray(result.scenes) || result.scenes.length < 1 || result.scenes.length > 20)
      throw new ServiceUnavailableException("Story provider returned an invalid scene list");
    const sceneRows = result.scenes.map((s: any, i: number) => ({
      id: randomUUID(), title: String(s.title ?? `Scene ${i + 1}`).slice(0, 120),
      narration: String(s.narration ?? "").slice(0, 3000), imagePrompt: String(s.imagePrompt ?? "").slice(0, 2000),
      duration: Math.min(60, Math.max(1, Number(s.duration) || 7)), motion: String(s.motion ?? "slow_zoom"), subtitle: String(s.subtitle ?? s.narration ?? "").slice(0, 3000),
    }));
    return { title: String(result.title ?? "Untitled story").slice(0, 120), synopsis: String(result.synopsis ?? "").slice(0, 2000), characters: Array.isArray(result.characters) ? result.characters.slice(0, 12) : [], scenes: sceneRows };
  }


  private comfyUrl() {
    return (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
  }

  private sceneForImage(story: Story, sceneId: string): Record<string, any> {
    const scene = (story.scenes as Array<Record<string, any>> | undefined)
      ?.find((item) => item.id === sceneId);
    if (!scene) throw new BadRequestException("Scene not found in saved story");
    return scene;
  }

  // POST returns as soon as ComfyUI accepts the prompt, instead of holding
  // the browser connection until the full SDXL inference and download finish.
  async startSceneImage(storyId: string, sceneId: string, imagePrompt: string) {
    const story = await this.get(storyId);
    if (!story) throw new BadRequestException("Story not found");
    const scene = this.sceneForImage(story, sceneId);
    const pending = scene.imageJob as { promptId: string; submittedAt: number } | undefined;
    const timeout = Number(process.env.COMFYUI_JOB_TIMEOUT_MS ?? 900000);
    if (pending?.promptId && Date.now() - pending.submittedAt < timeout) {
      return { status: "queued", promptId: pending.promptId };
    }

    const workflowPath = resolve("workflows/sdxl-background-api.json");
    let graph: any;
    try { graph = JSON.parse(await readFile(workflowPath, "utf8")); }
    catch { throw new ServiceUnavailableException("ComfyUI workflow is missing"); }
    graph["4"].inputs.ckpt_name = process.env.COMFYUI_CHECKPOINT ?? "sd_xl_base_1.0.safetensors";
    const [width, height] = story.aspect === "16:9" ? [1024, 576] : story.aspect === "1:1" ? [768, 768] : [576, 1024];
    graph["5"].inputs.width = width;
    graph["5"].inputs.height = height;
    graph["3"].inputs.seed = Math.floor(Math.random() * 2_147_000_000);
    graph["6"].inputs.text = `${imagePrompt}, cinematic illustration, consistent story character design`;
    graph["7"].inputs.text = "text, watermark, logo, blurry, deformed, low quality";
    graph["9"].inputs.filename_prefix = `AIStory/${storyId}/${sceneId}`;

    // The bundled SDXL graph is txt2img. When a saved character image exists,
    // turn it into a low-denoise img2img seed using built-in ComfyUI nodes.
    const characters = Array.isArray(story.characters) ? story.characters as Array<Record<string, unknown>> : [];
    const reference = characters.find((character) => typeof character.referenceUrl === "string")?.referenceUrl;
    const referencePath = this.assetFromUrl(reference, "image");
    if (referencePath) {
      const upload = await this.uploadComfyReference(referencePath);
      graph["10"] = { class_type: "LoadImage", inputs: { image: upload } };
      graph["12"] = { class_type: "ImageScale", inputs: { image: ["10", 0], upscale_method: "lanczos", width, height, crop: "center" } };
      graph["11"] = { class_type: "VAEEncode", inputs: { pixels: ["12", 0], vae: ["4", 2] } };
      graph["3"].inputs.latent_image = ["11", 0];
      graph["3"].inputs.denoise = Math.min(0.65, Math.max(0.25, Number(process.env.COMFYUI_REFERENCE_DENOISE ?? 0.45)));
    }

    let response: Response;
    try {
      response = await fetch(`${this.comfyUrl()}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: storyId }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(`ComfyUI queue request failed: ${String(error)}`);
    }
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new ServiceUnavailableException(`ComfyUI rejected the prompt (${response.status}): ${details}`);
    }
    const accepted = await response.json() as { prompt_id?: string };
    if (!accepted.prompt_id) throw new ServiceUnavailableException("ComfyUI did not return prompt_id");
    scene.imageJob = { promptId: accepted.prompt_id, submittedAt: Date.now() };
    await this.save(story, storyId);
    Logger.log(`Image queued: story=${storyId} scene=${sceneId} prompt=${accepted.prompt_id}`, "StoryImage");
    return { status: "queued", promptId: accepted.prompt_id };
  }

  private async uploadComfyReference(path: string): Promise<string> {
    const bytes = await readFile(path);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)]), basename(path));
    form.append("type", "input");
    form.append("overwrite", "true");
    let response: Response;
    try {
      response = await fetch(`${this.comfyUrl()}/upload/image`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    } catch (error) { throw new ServiceUnavailableException(`ComfyUI reference upload failed: ${String(error)}`); }
    if (!response.ok) throw new ServiceUnavailableException(`ComfyUI reference upload returned ${response.status}`);
    const result = await response.json() as { name?: string; subfolder?: string };
    if (!result.name) throw new ServiceUnavailableException("ComfyUI did not accept the character reference image");
    return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
  }

  // GET is also a recovery endpoint: it can find an output generated by the
  // old synchronous API whose /image request never made it back to the browser.
  async sceneImageStatus(storyId: string, sceneId: string) {
    const story = await this.get(storyId);
    if (!story) throw new BadRequestException("Story not found");
    const scene = this.sceneForImage(story, sceneId);
    const job = scene.imageJob as { promptId: string; submittedAt: number } | null | undefined;
    const base = this.comfyUrl();

    if (!job?.promptId) {
      if (typeof scene.imageUrl === "string" && scene.imageUrl) {
        return { status: "completed", url: scene.imageUrl };
      }
      const previous = await recoverPreviousOutput(base, storyId, sceneId);
      if (previous) return this.importCompletedImage(storyId, sceneId, previous.image);
      return { status: "idle" };
    }

    const entry = await promptHistory(base, job.promptId);
    const image = outputImage(entry);
    if (image) return this.importCompletedImage(storyId, sceneId, image);
    if (entry?.status?.status_str === "error") {
      scene.imageJob = null;
      await this.save(story, storyId);
      Logger.error(`ComfyUI job failed: ${job.promptId}`, "", "StoryImage");
      return { status: "failed", error: "ComfyUI could not generate the image. Check its console." };
    }
    if (Date.now() - job.submittedAt > Number(process.env.COMFYUI_JOB_TIMEOUT_MS ?? 900000)) {
      return { status: "failed", error: "ComfyUI image generation timed out; check history before retrying." };
    }
    let running = false;
    try {
      const queue = await fetch(`${base}/queue`, { signal: AbortSignal.timeout(5000) });
      if (queue.ok) {
        const data = await queue.json() as { queue_running?: unknown[][] };
        running = (data.queue_running ?? []).some((row) => row[1] === job.promptId);
      }
    } catch { /* History remains authoritative even if queue is temporarily unavailable. */ }
    return { status: running ? "running" : "queued", promptId: job.promptId };
  }

  private async importCompletedImage(storyId: string, sceneId: string, image: ComfyImage) {
    // Validate the descriptor before fetching. Avoid accepting another story's asset.
    const folder = String(image.subfolder ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (folder !== `AIStory/${storyId}` || !image.filename.startsWith(`${sceneId}_`)) {
      throw new ServiceUnavailableException("ComfyUI output does not belong to this scene");
    }
    const bytes = await retrieveComfyPng(this.comfyUrl(), image);
    const story = await this.get(storyId);
    if (!story) throw new BadRequestException("Story was removed");
    const scene = this.sceneForImage(story, sceneId);
    if (scene.imageUrl && !scene.imageJob) {
      return { status: "completed", url: scene.imageUrl };
    }
    await mkdir(this.root, { recursive: true });
    const id = randomUUID();
    const url = `/api/v1/stories/assets/${id}.png`;
    await writeFile(join(this.root, `${id}.png`), bytes);
    scene.imageUrl = url;
    scene.imageJob = null;
    await this.save(story, storyId);
    Logger.log(`Imported ComfyUI image: story=${storyId} scene=${sceneId} bytes=${bytes.length}`, "StoryImage");
    return { status: "completed", url };
  }

  async generateVoice(story: Story, sceneId: string, requestedVoice?: string) {
    const scenes = story.scenes as Array<Record<string, any>>;
    const scene = scenes?.find((item) => item.id === sceneId);
    if (!scene || typeof scene.narration !== "string" || !scene.narration.trim())
      throw new BadRequestException("Scene narration is required");
    const language = String(story.language ?? "ไทย").toLowerCase().startsWith("en") ? "English" : "Thai";
    const created = await this.mossRequest("/v1/jobs", {
      method: "POST",
      body: JSON.stringify({ text: scene.narration.trim(), language, voice_id: requestedVoice || null }),
    });
    const job = await created.json() as { id?: string; status?: string };
    if (!job.id) throw new ServiceUnavailableException("MOSS Voice Studio did not return a job ID");
    scene.voiceJob = { id: job.id, voiceId: requestedVoice ?? null, status: job.status ?? "queued" };
    await this.save(story, story.id);
    return { id: job.id, status: job.status ?? "queued" };
  }

  async sceneVoiceStatus(story: Story, sceneId: string) {
    const scenes = story.scenes as Array<Record<string, any>>;
    const scene = scenes?.find((item) => item.id === sceneId);
    if (!scene) throw new BadRequestException("Scene not found");
    if (scene.audioUrl && !scene.voiceJob) return { status: "completed", url: scene.audioUrl };
    const jobId = scene.voiceJob?.id;
    if (!jobId) return { status: "idle" };
    const response = await this.mossRequest(`/v1/jobs/${encodeURIComponent(jobId)}`);
    const job = await response.json() as { status?: string; error?: string };
    if (job.status === "failed") {
      scene.voiceJob.status = "failed";
      scene.voiceJob.error = job.error ?? "MOSS voice generation failed";
      await this.save(story, story.id);
      return { status: "failed", error: scene.voiceJob.error };
    }
    if (job.status !== "completed") {
      scene.voiceJob.status = job.status ?? "running";
      await this.save(story, story.id);
      return { status: scene.voiceJob.status };
    }
    const audioResponse = await this.mossRequest(`/v1/jobs/${encodeURIComponent(jobId)}/audio`);
    const bytes = Buffer.from(await audioResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new ServiceUnavailableException("MOSS returned empty or oversized audio");
    await mkdir(this.root, { recursive: true });
    const fileId = randomUUID();
    await writeFile(join(this.root, `${fileId}.wav`), bytes);
    scene.audioUrl = `/api/v1/stories/assets/${fileId}.wav`;
    scene.voiceProfileId = scene.voiceJob.voiceId ?? null;
    scene.voiceJob = null;
    await this.save(story, story.id);
    return { status: "completed", url: scene.audioUrl };
  }

  async render(story: Story) {
    const scenes = story.scenes as Array<Record<string, any>>;
    if (!Array.isArray(scenes) || !scenes.length) throw new BadRequestException("Storyboard has no scenes");
    const aspect = story.aspect === "16:9" ? [1920, 1080] : [1080, 1920];
    const work = join(this.root, `.render-${randomUUID()}`);
    await mkdir(work, { recursive:true });
    const clips: string[] = [];
    try {
      for (const [index, scene] of scenes.entries()) {
        const imagePath = this.assetFromUrl(scene.imageUrl, "png");
        const audioPath = this.assetFromUrl(scene.audioUrl, "audio");
        if (!imagePath || !audioPath) throw new BadRequestException(`Scene ${index + 1} needs a generated image and narration`);
        await Promise.all([access(imagePath), access(audioPath)]);
        const duration = Math.max(1, Math.min(60, Number(scene.duration) || 7));
        const clip = join(work, `scene-${String(index).padStart(3,"0")}.mp4`);
        const [width, height] = aspect;
        const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='min(zoom+0.0002,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=30`;
        await this.runFfmpeg(["-y","-loop","1","-i",imagePath,"-i",audioPath,"-t",String(duration),"-vf",filter,"-af","apad","-r","30","-c:v","libx264","-preset","veryfast","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart",clip]);
        clips.push(clip);
      }
      const concat = join(work,"concat.txt");
      await writeFile(concat, clips.map((file) => `file '${file.replace(/\\/g,"/").replace(/'/g,"'\\''")}'`).join("\n"),"utf8");
      const id = randomUUID();
      const videoPath = join(this.root, `${id}.mp4`);
      const concatenated = join(work,"story.mp4");
      await this.runFfmpeg(["-y","-f","concat","-safe","0","-i",concat,"-c","copy","-movflags","+faststart",concatenated]);
      const musicPath = this.assetFromUrl(story.musicUrl,"audio");
      if (musicPath) {
        await access(musicPath);
        await this.runFfmpeg(["-y","-i",concatenated,"-stream_loop","-1","-i",musicPath,"-filter_complex","[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]","-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",videoPath]);
      } else {
        const { copyFile } = await import("node:fs/promises");
        await copyFile(concatenated,videoPath);
      }
      const subtitles = this.toSrt(scenes);
      const subtitleId = randomUUID();
      await writeFile(join(this.root, `${subtitleId}.srt`), subtitles, "utf8");
      story.videoUrl = `/api/v1/stories/assets/${id}.mp4`;
      story.subtitlesUrl = `/api/v1/stories/assets/${subtitleId}.srt`;
      await this.save(story, story.id);
      return { id, url:story.videoUrl, subtitlesUrl:story.subtitlesUrl };
    } finally {
      const { rm } = await import("node:fs/promises");
      await rm(work, { recursive:true, force:true });
    }
  }

  private assetFromUrl(value: unknown, extension: string) {
    if (typeof value !== "string") return null;
    if (extension === "audio") {
      const match=value.match(/\/stories\/assets\/([0-9a-f-]{36})\.(mp3|wav|m4a|ogg|webm)$/i);
      return match ? join(this.root,`${match[1]}.${match[2]}`) : null;
    }
    if (extension === "image") {
      const match = value.match(/\/stories\/assets\/([0-9a-f-]{36})\.(png|jpg)$/i);
      return match ? join(this.root, `${match[1]}.${match[2]}`) : null;
    }
    const match = value.match(new RegExp(`/stories/assets/([0-9a-f-]{36})\\.${extension}$`,"i"));
    return match ? join(this.root, `${match[1]}.${extension}`) : null;
  }

  private toSrt(scenes: Array<Record<string, any>>) {
    let cursor = 0;
    return scenes.map((scene,index) => {
      const duration = Math.max(1, Math.min(60, Number(scene.duration) || 7));
      const start = this.srtTime(cursor);
      cursor += duration;
      const end = this.srtTime(cursor);
      return `${index + 1}\n${start} --> ${end}\n${String(scene.subtitle || scene.narration || "").trim()}\n`;
    }).join("\n");
  }

  private srtTime(seconds: number) {
    const ms = Math.round(seconds * 1000);
    const hh = String(Math.floor(ms / 3600000)).padStart(2,"0");
    const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2,"0");
    const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2,"0");
    return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3,"0")}`;
  }

  private runFfmpeg(args: string[]) {
    return new Promise<void>((resolvePromise,rejectPromise) => {
      const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, { stdio:["ignore","ignore","pipe"] });
      let error = "";
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error = (error + chunk).slice(-4000); });
      child.on("error", () => rejectPromise(new ServiceUnavailableException("FFmpeg could not start; check FFMPEG_PATH")));
      child.on("close", (code) => code === 0 ? resolvePromise() : rejectPromise(new ServiceUnavailableException(`FFmpeg render failed: ${error.slice(-800)}`)));
    });
  }

  private youtubeTokenPath() { return join(this.root,"youtube-token.json"); }

  private async youtubeAccessToken() {
    let token: Record<string,any>;
    try { token = JSON.parse(await readFile(this.youtubeTokenPath(),"utf8")); }
    catch { throw new ServiceUnavailableException("Connect a YouTube account before uploading"); }
    if (Number(token.expires_at||0) < Date.now()+60000) {
      const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.YOUTUBE_CLIENT_ID!,client_secret:process.env.YOUTUBE_CLIENT_SECRET!,refresh_token:token.refresh_token,grant_type:"refresh_token"}),signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new ServiceUnavailableException("Could not refresh the YouTube authorization; reconnect the account");
      const renewed = await response.json() as Record<string,any>;
      token = {...token,...renewed,expires_at:Date.now()+Number(renewed.expires_in||3600)*1000};
      await writeFile(this.youtubeTokenPath(),JSON.stringify(token),{mode:0o600});
    }
    return String(token.access_token);
  }

  private ffmpegAvailable() {
    return new Promise<boolean>((resolvePromise) => {
      const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg",["-version"],{stdio:"ignore"});
      child.on("error",()=>resolvePromise(false));
      child.on("close",(code)=>resolvePromise(code===0));
    });
  }

  assetPath(file: string) {
    if (!/^[0-9a-f-]{36}\.(png|jpg|mp3|mp4|srt|wav|m4a|ogg|webm)$/i.test(file)) return null;
    return join(this.root, basename(file));
  }

  assetContentType(file: string) {
    const ext = file.slice(file.lastIndexOf(".")+1).toLowerCase();
    return ({png:"image/png",jpg:"image/jpeg",mp3:"audio/mpeg",mp4:"video/mp4",srt:"text/plain; charset=utf-8",wav:"audio/wav",m4a:"audio/mp4",ogg:"audio/ogg",webm:"audio/webm"} as Record<string,string>)[ext] ?? "application/octet-stream";
  }

  async assertAsset(path: string) { await access(path); }

  private async read(id: string): Promise<Story | null> {
    try { return JSON.parse(await readFile(join(this.root, `${id}.json`), "utf8")) as Story; }
    catch { return null; }
  }
}
