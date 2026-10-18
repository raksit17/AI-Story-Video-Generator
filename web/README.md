# Web — AI Story Video Generator

Frontend built with Vue 3, TypeScript, and Vite. The Storyframe workspace supports a local storyboard draft, scene editing and ordering, image uploads, character reference notes, production and YouTube preparation screens, and JSON project import/export.

## Run

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The project saves its current draft in browser storage.

## API connection

The storyboard form calls `POST /api/v1/stories/storyboard`. If the story provider is unavailable, the UI reports an error; an explicit sample-only button is available.

### Generate a scene image with ComfyUI

1. Start PostgreSQL and the backend (from `api/`: `npm run db:migrate`, then `npm run start:dev`).
2. Start ComfyUI on `http://127.0.0.1:8188` and install `sd_xl_base_1.0.safetensors` in `models/checkpoints`.
3. Configure `COMFYUI_URL` and `COMFYUI_CHECKPOINT` in `api/.env`.
4. Configure `API_PROXY_TARGET=http://127.0.0.1:3002` in `web/.env`; run `npm run dev`.
5. Enter a story prompt, create a storyboard, select a scene, edit its image prompt, then select **Generate AI Image**.

The web app first saves the entire story using `POST /api/v1/stories` or `PUT /api/v1/stories/:id`, then queues the ComfyUI image with `POST /api/v1/stories/:id/scenes/:sceneId/image`. Instead of blocking one browser request for several minutes, the web app polls `GET /api/v1/stories/:id/scenes/:sceneId/image/status` approximately every 2 seconds. The API imports the completed PNG, writes it in `api/storage/stories`, and records `scene.imageUrl` in the saved Story JSON for later rendering. The web displays a real queued/running state and loads the PNG into the scene preview. It also attempts to recover completed PNGs from earlier synchronous requests by matching the scene ID and story ID in ComfyUI History (within the latest 100 entries). Manual image uploads remain browser-local.

For local testing, keep `HOST=127.0.0.1` and leave `API_KEY` empty, or use a trusted server-side gateway to provide `X-API-Key`. Do **not** place API secrets in browser-exposed `VITE_*` variables. Voice generation, video rendering, and YouTube upload still require separate provider configuration and UI wiring.


### Character reference images — SDXL IP-Adapter (not img2img)

In Phase 03, save a PNG/JPEG character reference. On **สร้างภาพ AI** or **สร้างภาพใหม่**, NestJS sends its stored pixels to ComfyUI and uses `LoadImage → IPAdapterModelLoader + CLIPVisionLoader → IPAdapterAdvanced → KSampler` with `EmptyLatentImage`. Thus each scene's text prompt, not the reference's original crop, controls the new background, pose and framing. The browser reports **SDXL IP-Adapter** while rendering. Existing saved images remain available; pressing Generate explicitly requests a fresh render instead of automatically recovering an older image. Opening a saved project still recovers a pending or completed image.

**One-time setup is mandatory**: install `cubiq/ComfyUI_IPAdapter_plus` in your ComfyUI custom nodes, download the matching ViT-H image encoder to `ComfyUI/models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`, and the SDXL Plus adapter to `ComfyUI/models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors`. Restart ComfyUI afterward. Exact download links and Windows steps are in [IPADAPTER_SETUP.md](../comfyui/IPADAPTER_SETUP.md). The API checks the installed nodes and model choices via `/object_info` and reports a descriptive error rather than silently reverting to img2img.

For an RTX 4060 laptop (8 GB VRAM), start at `COMFYUI_IPADAPTER_WEIGHT=0.70` and `COMFYUI_IPADAPTER_END_AT=0.85`. Lower weight (e.g. 0.55) can increase prompt freedom; higher may preserve more reference characteristics but may bias composition. Identity is **not guaranteed** across poses, and IP-Adapter does not automatically enforce an identical face. Existing SDXL `COMFYUI_REFERENCE_DENOISE` is ignored. Keep the API story assets directory; deleting it breaks saved image references.

### AI Story Planner (Ollama + Qwen)

The Storyboard **สร้างสตอรี่บอร์ดด้วย AI** button now calls NestJS `POST /api/v1/stories/storyboard`. With the default `STORY_PROVIDER=ollama`, NestJS sends the story idea, language, genre, aspect ratio, and selected character appearance to a local Ollama Qwen model to generate scene-specific **narration in the chosen language and English ComfyUI imagePrompt for the SAME event**. It returns clear API errors rather than silently replacing a failed AI result with the old generic five-scene sample. To try that original sample, explicitly choose **ใช้โครงเรื่องตัวอย่าง (ไม่ใช้ AI)**.

Windows setup:

```powershell
ollama pull qwen3.5:4b
ollama list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

In `api/.env`:

```dotenv
STORY_PROVIDER=ollama
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_STORY_MODEL=qwen3.5:4b
```

Restart the API after editing `.env`; Web still uses `API_PROXY_TARGET=http://127.0.0.1:3002`. No OpenAI API key is needed for Ollama. If preferred, choose `STORY_PROVIDER=openai`, `OPENAI_API_KEY=<your-secret>`, and `STORY_MODEL=gpt-4o-mini` in **API** environment, never in browser `VITE_*` values.

After editing a scene's **บทบรรยาย**, press **สร้าง Prompt ภาพจากบทบรรยาย** to call `POST /api/v1/stories/scene-visual`. It translates the narration and selected character's fixed appearance into a drawable English visual prompt without overwriting the voiceover. Then press **สร้างภาพ AI** to render the new prompt. The old image preview is retained until a new image finishes; narration edits alone do not regenerate images or change an already completed render. The character profile reference PNG is used by ComfyUI SDXL IP-Adapter (when the matching models and custom node are installed). GPU runtime and model availability must be checked locally; GitHub CI mocks the Ollama response and doesn't run model inference.

