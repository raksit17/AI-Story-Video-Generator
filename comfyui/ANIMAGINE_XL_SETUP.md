# Animagine XL 3.1 for AI Story Video Generator (Windows / ComfyUI Portable)

[Animagine XL 3.1 (official model card)](https://huggingface.co/cagliostrolab/animagine-xl-3.1) is an SDXL anime checkpoint. It is **not** automatically downloaded by a GitHub pull or by installing IP-Adapter nodes. The standalone `animagine-xl-3.1.safetensors` is about **6.94 GB**. Check the official Hugging Face model license before use or redistribution.

## 1. Download the actual checkpoint to the correct directory

For your portable ComfyUI layout, open PowerShell:

```powershell
$comfy = "D:\AI\ComfyUI_windows_portable\ComfyUI_windows_portable\ComfyUI"
$checkpoints = Join-Path $comfy "models\checkpoints"
New-Item -ItemType Directory -Force -Path $checkpoints | Out-Null
$file = Join-Path $checkpoints "animagine-xl-3.1.safetensors"
curl.exe -fL --retry 3 -C - -o "$file" "https://huggingface.co/cagliostrolab/animagine-xl-3.1/resolve/main/animagine-xl-3.1.safetensors"
if ($LASTEXITCODE -ne 0) { throw "Model download failed; inspect curl output" }
Get-Item $file | Select-Object FullName, Length
```

The file must be multiple GB; a tiny HTML or text file is not a working checkpoint. Do **not** put it under `custom_nodes/models` or `models/ipadapter`. Keep `sd_xl_base_1.0.safetensors` intact so you can switch back.

## 2. Restart ComfyUI and verify its checkpoint selector

Stop ComfyUI, relaunch `run_nvidia_gpu.bat`, and check:

```powershell
$info = Invoke-RestMethod "http://127.0.0.1:8188/object_info/CheckpointLoaderSimple"
$info.CheckpointLoaderSimple.input.required.ckpt_name[0]
```

You must see `animagine-xl-3.1.safetensors`. If not, inspect the active portable install root and restart again.

## 3. NestJS API configuration

Add to `api/.env`:

```dotenv
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=sd_xl_base_1.0.safetensors
COMFYUI_ANIMAGINE_CHECKPOINT=animagine-xl-3.1.safetensors
COMFYUI_IPADAPTER_MODEL=ip-adapter-plus_sdxl_vit-h.safetensors
COMFYUI_CLIP_VISION_MODEL=CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors
COMFYUI_IPADAPTER_WEIGHT=0.55
COMFYUI_IPADAPTER_END_AT=0.85
```

Restart the NestJS API after changing `.env`. The Web UI has **โมเดลสร้างภาพ** next to the Storyboard aspect-ratio setting. Choose **Animagine XL 3.1 (Anime)**, then click **สร้างภาพ AI / สร้างภาพใหม่**. Project saves and reloads the model preset; older stories without an explicit selection continue to use SDXL Base.

## 4. Quality settings

When Animagine is selected the backend automatically uses:

- Positive prompt prefix: `masterpiece, best quality, very aesthetic, absurdres, anime illustration`
- Negative prompt: low quality, text, watermark, bad anatomy/hands/eyes and other quality problems.
- Sampler: Euler Ancestral (`euler_ancestral` in ComfyUI)
- Steps: **28**; CFG: **6**; denoise: **1**
- The same SDXL **IP-Adapter Plus ViT-H** character reference path when one is saved, with **a fresh scene latent**.

These settings follow the model developer's guidelines. The project keeps its previous output sizes (portrait **576 × 1024**, landscape **1024 × 576**, square **768 × 768**) to limit memory on an RTX 4060 8 GB. These are conservative resolutions, not necessarily the model's optimal sizes. A higher resolution might improve details but can require more VRAM.

## 5. Important compatibility and troubleshooting

- Animagine XL 3.1 is an SDXL fine-tune, so the SDXL ViT-H adapter is the appropriate family. Visual results and identity stability must still be tested with the actual GPU.
- The backend checks the checkpoint names from ComfyUI `/object_info/CheckpointLoaderSimple` before submitting an Animagine scene. If it is missing, it returns an explicit error rather than silently using SDXL Base.
- Model not found? Check **ComfyUI/models/checkpoints** and the exact filename specified in `COMFYUI_ANIMAGINE_CHECKPOINT`, then restart ComfyUI.
- Out of GPU memory? Close competing GPU applications, avoid parallel image jobs, consider lower sampling resolution or disable the image reference to compare.
- Face mismatch or copied reference background? Try IP-Adapter weight between 0.50–0.70; changing a checkpoint alone does not guarantee exact identity.
- If you need the original look, select **SDXL Base 1.0** in the Web UI. You do not need to remove Animagine to switch back.

The model file itself is intentionally not committed to GitHub (large third-party checkpoint).
