# SDXL IP-Adapter Character Consistency — Windows

The Storyframe character reference now conditions **the SDXL model** via IP-Adapter Plus, while **each scene starts with a fresh latent** and uses its own visual prompt. This fixes repeated office-uniform crops from the former low-denoise img2img workflow.

## 1. Install the custom nodes

Close ComfyUI. Locate your ComfyUI root inside your portable installation, e.g.

```powershell
cd "D:\AI\ComfyUI_windows_portable\ComfyUI_windows_portable\ComfyUI\custom_nodes"
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
```

If already installed, update the custom node instead of cloning another copy. Use the ComfyUI Manager as an alternative.

## 2. Install the *matching* models

Use the official model sources for **SDXL Plus ViT-H** and **CLIP ViT-H**, not ViT-bigG, SD 1.5, or FaceID. Download from:

- CLIP Vision `https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors`
  Save and **rename** it to `ComfyUI/models/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors`.
- SDXL Plus `https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors`
  Save it to `ComfyUI/models/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors`.
- Continue using your existing SDXL `sd_xl_base_1.0.safetensors` checkpoint in `ComfyUI/models/checkpoints/`.

See `https://github.com/cubiq/ComfyUI_IPAdapter_plus` for the authoritative compatibility table.

Restart ComfyUI with `run_nvidia_gpu.bat`. Ensure `http://127.0.0.1:8188` is responding.

## 3. Set `api/.env`

```dotenv
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=sd_xl_base_1.0.safetensors
COMFYUI_CLIP_VISION_MODEL=CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
COMFYUI_IPADAPTER_MODEL=ip-adapter-plus_sdxl_vit-h.safetensors
COMFYUI_IPADAPTER_WEIGHT=0.70
COMFYUI_IPADAPTER_END_AT=0.85
```

`COMFYUI_REFERENCE_DENOISE` is not used with IP-Adapter. The SDXL `KSampler` intentionally keeps `denoise=1` and uses `EmptyLatentImage`. Restart NestJS after updating `.env`.

To verify installed ComfyUI nodes in PowerShell:

```powershell
(Invoke-RestMethod http://127.0.0.1:8188/object_info/IPAdapterAdvanced).IPAdapterAdvanced.display_name
(Invoke-RestMethod http://127.0.0.1:8188/object_info/IPAdapterModelLoader).IPAdapterModelLoader.display_name
(Invoke-RestMethod http://127.0.0.1:8188/object_info/CLIPVisionLoader).CLIPVisionLoader.display_name
```

The backend also validates the exact model names before queuing a scene. Missing models/custom nodes result in a descriptive error rather than silently switching to prompt-only or img2img.

## 4. Test two different scenes

1. In Phase 03, save one PNG/JPEG reference of your character to the backend.
2. Apply it to the story and keep the reference profile selected.
3. In Phase 01, give scene 1 a prompt describing an office shot and scene 2 a prompt describing a forest shot. Use **สร้าง Prompt ภาพจากบทบรรยาย** if necessary.
4. Click **สร้างภาพ AI** for each. For an already rendered scene, click **สร้างภาพใหม่**. Clicking the button queues a fresh image even if an older output exists.
5. Watch the ComfyUI queue and verify that the outputs have different compositions. Keep the old image while a new one renders; the new saved image replaces it on completion.

## Troubleshooting

- **Missing node/model**: install the listed custom node / weights in the *active* ComfyUI directory and restart.
- **Out of memory on RTX 4060 8 GB**: close concurrent GPU applications, try a less memory-intensive SDXL checkpoint/workflow or lower resolution. The app uses approximately 576×1024 for portrait scenes and 1024×576 for landscape; GPU OOM is still possible.
- **Same look/crop**: lower `COMFYUI_IPADAPTER_WEIGHT` gradually (e.g. 0.55–0.65), ensure the scene-specific prompts describe visibly different compositions. Extreme character similarity is not guaranteed by IP-Adapter.
- **Existing scene seems unchanged**: verify the new `prompt_id` in the API logs and ComfyUI History. Explicit Generate now creates a new job unless an existing generation is still queued.
- **Local Git merge conflicts**: check `git status` and resolve conflicts before pulling. Do not discard uncommitted local edits, character profile assets, or `.env` accidentally.
