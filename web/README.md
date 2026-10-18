# Web — AI Story Video Generator

Frontend built with Vue 3, TypeScript, and Vite. The Storyframe workspace supports a local storyboard draft, scene editing and ordering, image uploads, character reference notes, production and YouTube preparation screens, and JSON project import/export.

## Run

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite. The project saves its current draft in browser storage.

## API connection

The storyboard form calls `POST /api/v1/stories/storyboard`. If the story provider is unavailable, it creates a local sample storyboard.

### Generate a scene image with ComfyUI

1. Start PostgreSQL and the backend (from `api/`: `npm run db:migrate`, then `npm run start:dev`).
2. Start ComfyUI on `http://127.0.0.1:8188` and install `sd_xl_base_1.0.safetensors` in `models/checkpoints`.
3. Configure `COMFYUI_URL` and `COMFYUI_CHECKPOINT` in `api/.env`.
4. Configure `API_PROXY_TARGET=http://127.0.0.1:3002` in `web/.env`; run `npm run dev`.
5. Enter a story prompt, create a storyboard, select a scene, edit its image prompt, then select **Generate AI Image**.

The web app first saves the entire story using `POST /api/v1/stories` or `PUT /api/v1/stories/:id`, then queues the ComfyUI image with `POST /api/v1/stories/:id/scenes/:sceneId/image`. Instead of blocking one browser request for several minutes, the web app polls `GET /api/v1/stories/:id/scenes/:sceneId/image/status` approximately every 2 seconds. The API imports the completed PNG, writes it in `api/storage/stories`, and records `scene.imageUrl` in the saved Story JSON for later rendering. The web displays a real queued/running state and loads the PNG into the scene preview. It also attempts to recover completed PNGs from earlier synchronous requests by matching the scene ID and story ID in ComfyUI History (within the latest 100 entries). Manual image uploads remain browser-local.

For local testing, keep `HOST=127.0.0.1` and leave `API_KEY` empty, or use a trusted server-side gateway to provide `X-API-Key`. Do **not** place API secrets in browser-exposed `VITE_*` variables. Voice generation, video rendering, and YouTube upload still require separate provider configuration and UI wiring.


### Character reference images (ComfyUI img2img)

In Phase 03, choose a character, enter its fixed appearance, upload a PNG or JPEG, and click **บันทึกตัวละครไว้ใช้ซ้ำ**. This uploads the actual bytes to the NestJS story assets directory. **ใช้กับทุกฉาก →** also saves/links the uploaded image to the story, not just the text description. When a scene image is generated, NestJS retrieves the persisted character image and posts it to ComfyUI `/upload/image`; the workflow uses built-in `LoadImage → ImageScale → VAEEncode → KSampler` nodes instead of an empty latent. The UI reports whether a reference image was actually used. An invalid or missing referenced asset causes an explicit error, not a silent prompt-only fallback.

For RTX 4060 8 GB, set `COMFYUI_REFERENCE_DENOISE=0.45` in `api/.env`; this controls image-to-image change strength (accepted 0.25–0.80). Small values preserve source composition/clothes but make changing pose or camera difficult; larger values permit changes but reduce similarity. Basic SDXL img2img cannot guarantee identical faces across different poses. IP-Adapter or a trained character LoRA would be a separate enhancement requiring additional ComfyUI models/custom nodes.

Only PNG/JPEG up to 8 MiB is accepted, and the API JSON parser supports the base64 payload. If you have a pre-existing local project, save the character once before generating. Keep the original NestJS `api/storage/stories` directory, otherwise saved reference URLs become invalid. Generate new images after changing a character; already-rendered images will not be rewritten automatically.
