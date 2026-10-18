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

The web app first saves the entire story using `POST /api/v1/stories` or `PUT /api/v1/stories/:id`, then calls `POST /api/v1/stories/:id/scenes/:sceneId/image`. The API generates a PNG through ComfyUI, writes it in `api/storage/stories`, and saves its URL as `scene.imageUrl` in the server-side story JSON. The browser also stores the story ID and image URL and displays the generated image in the scene preview. Generating can take several minutes. Manual image uploads are still browser-local and do not yet become renderable server-side assets.

For local testing, keep `HOST=127.0.0.1` and leave `API_KEY` empty, or use a trusted server-side gateway to provide `X-API-Key`. Do **not** place API secrets in browser-exposed `VITE_*` variables. Voice generation, video rendering, and YouTube upload still require separate provider configuration and UI wiring.
