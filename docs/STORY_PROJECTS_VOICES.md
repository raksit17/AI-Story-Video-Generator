# Projects, character continuity, and MOSS voices

## Windows local startup

From PowerShell, install and start the story API:

```powershell
cd D:\GitPoom\AI Story Video Generator\api
npm ci
Copy-Item .env.example .env
```

Set `DATABASE_URL` in `api/.env` to the local PostgreSQL database already used by this project (the API also serves the thumbnail/video routes). Keep `HOST=127.0.0.1`, set `COMFYUI_URL=http://127.0.0.1:8188`, and leave the MOSS values below at their local defaults. Then run the existing schema migration and start Nest:

```powershell
npm run db:migrate
npm run start:dev
```

In another PowerShell window, start the web app:

```powershell
cd D:\GitPoom\AI Story Video Generator\web
npm ci
Copy-Item .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite dev server proxies `/api` to the Nest API on port 3002. Start ComfyUI with its SDXL checkpoint and the existing `api/workflows/sdxl-background-api.json` workflow available to the API.

Start the MOSS service in a third PowerShell window using the MOSS starter's activated Python 3.12 environment:

```powershell
cd D:\GitPoom\moss-voice-studio-starter\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The MOSS model and CUDA dependencies must already be installed as described in that repository's README. Check `http://127.0.0.1:8001/v1/health` through the authenticated local client before generating audio; model load and first inference can take several minutes.

## Persistent projects

Projects are stored as JSON files under `api/storage/stories` (or `STORY_STORAGE_DIR` if set). The Storyframe header can save a project, start a new one, and open any project returned by `GET /api/v1/stories`. Saving an existing project updates its current ID. Story data, scene prompts, ComfyUI job IDs, imported images, and MOSS audio URLs survive browser restarts; the local browser copy remains a convenience cache.

The API supports `POST /api/v1/stories`, `GET /api/v1/stories`, `GET /api/v1/stories/:id`, and `PUT /api/v1/stories/:id`. Keep the storage folder in backups when moving the local installation to another computer.

## Reusable character profiles

Phase 3 can save multiple character profiles with an appearance description, optional PNG/JPEG reference, and an optional MOSS voice profile ID. Select a saved character in another project and save the project to link that profile to its scenes. Profile metadata and reference images are stored locally under the story storage directory. Character descriptions are appended to scene prompts.

The bundled SDXL graph scales a saved reference to the project's aspect ratio and uses it as an img2img seed through ComfyUI's built-in `LoadImage`, `ImageScale`, and `VAEEncode` nodes. `COMFYUI_REFERENCE_DENOISE=0.45` is the default; values are clamped to 0.25–0.65. Lower values preserve more of the reference composition while higher values permit more scene variation. This improves appearance continuity, but standard SDXL img2img does not guarantee identity and can carry the reference pose/background into a new scene. There is no assumption that IPAdapter or custom ComfyUI nodes are installed.

## MOSS Voice Studio

The story API acts as a local server-side proxy to the real MOSS endpoints. It reads voice profiles from `GET /v1/voices`, creates jobs through `POST /v1/jobs`, polls `GET /v1/jobs/:id`, and downloads the completed WAV from `GET /v1/jobs/:id/audio`. It forwards `X-API-Key`, reuses the selected MOSS `voice_id`, and sends the project's language as `Thai` or `English`. The generated WAV is stored alongside the project and can be used by FFmpeg rendering.

In `api/.env`, configure:

```dotenv
MOSS_API_URL=http://127.0.0.1:8001
MOSS_API_KEY=local-dev-key
```

Use the same URL and key configured in the MOSS starter's `backend/.env` (`APP_PORT=8001`, `API_KEY=local-dev-key` by default). Start the MOSS FastAPI service and wait for its authenticated `GET /v1/health` to respond before opening Phase 2. The MOSS model is loaded lazily; first synthesis can take several minutes. The story API does not expose the MOSS key to the browser.

The image profile reference upload accepts PNG/JPEG up to 8 MiB; Nest's JSON request limit is 12 MiB to accommodate base64 encoding. Story and character metadata are local single-user files and have no multi-user access controls; keep the API bound to localhost unless a protected deployment is added.
