# Phase 3 — AI Thumbnail Generator / 0.3.0

## ติดตั้งครั้งนี้มีอะไรเปลี่ยน

- `youtube-thumbnail-api` 0.3.0: คิว PostgreSQL, ComfyUI client, workflow, เก็บพื้นหลังเป็น assets
- `youtube-thumbnail-web` 0.3.0: Prompt, 4 styles, 1–3 variations, สถานะงาน, composition previews และ layout อัตโนมัติ
- `youtube-thumbnail-comfyui`: ชุดตั้งค่า ComfyUI/SDXL สำหรับเครื่อง Windows
- `youtube-thumbnail-ai` 0.2.0 ใช้ต่อได้ ไม่ต้องอัปเกรด. ให้ `DEVICE=cpu` ระหว่างใช้ SDXL เพื่อลดการแย่ง VRAM; คิว Phase 3 ไม่ได้ล็อก GPU ร่วมกับ rembg หรือ DaVinci Resolve.

สำรอง source เดิม, `.env`, database และ `storage` ก่อนอัปเกรด. แทนที่ source โดยคง `.env`/`storage` เดิมไว้. **Phase 3 ต้องรัน `npm run db:migrate` เพิ่มตาราง `thumbnail_editor.ai_jobs`**. ไม่เปลี่ยน `public.*` และไม่แก้ Draft version 1. ขั้นตอนใน PHASE2.md ที่บอกไม่ต้อง migration หมายถึง Phase 2 เท่านั้น.

## 1. ติดตั้ง ComfyUI Portable และ SDXL บน Windows

1. ดาวน์โหลดแพ็กเกจ NVIDIA จาก [คู่มือ ComfyUI Portable ทางการ](https://docs.comfy.org/installation/comfyui_portable_windows) แล้วแตกเป็น `D:\AI\ComfyUI_windows_portable`. ComfyUI ใช้ Python ที่มากับ Portable แยกจาก rembg venv.
2. ดาวน์โหลด `sd_xl_base_1.0.safetensors` จาก [Stability AI SDXL Base 1.0 — Files](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/tree/main). วางไฟล์ใน `D:\AI\ComfyUI_windows_portable\ComfyUI\models\checkpoints\`. ไม่ต้องดาวน์โหลด Refiner สำหรับ workflow นี้.
3. เปิด PowerShell และรัน **บรรทัดเดียว**:

```powershell
& "D:\AI\ComfyUI_windows_portable\python_embeded\python.exe" -s "D:\AI\ComfyUI_windows_portable\ComfyUI\main.py" --windows-standalone-build --listen 127.0.0.1 --port 8188
```

หรือเรียก `start-comfyui.ps1 -ComfyDir "D:\AI\ComfyUI_windows_portable"` จากชุดตั้งค่า หากเครื่องอนุญาตให้รัน PowerShell scripts. หาก script ถูกบล็อก ใช้คำสั่ง Python ด้านบนได้โดยตรง.

เปิด http://127.0.0.1:8188 ตรวจว่า ComfyUI พร้อม. จากโฟลเดอร์ชุดตั้งค่า:

```powershell
node check-comfyui.mjs http://127.0.0.1:8188 sd_xl_base_1.0.safetensors
```

ควรได้ `connected: true`, `checkpointAvailable: true`. หากชื่อ checkpoint ของคุณต่างออกไป ให้ตั้งชื่อตรงกันใน `.env` ของ API. ไม่ต้อง import workflow เข้า UI ก่อน: NestJS อ่าน API JSON ที่แนบแล้วส่งเอง.

## 2. อัปเกรด NestJS

เพิ่มใน `.env` เดิม:

```dotenv
COMFYUI_URL=http://127.0.0.1:8188
COMFYUI_CHECKPOINT=sd_xl_base_1.0.safetensors
COMFYUI_JOB_TIMEOUT_MS=900000
AI_QUEUE_ENABLED=true
```

เปิด terminal ใหม่แล้วรันทีละบรรทัด:

```powershell
cd D:\GitPoom\youtube-thumbnail-api
npm ci
npm run db:migrate
npm run build
npm start
```

รันจากโฟลเดอร์ API เพราะ workflow อ้างอิง `workflows/sdxl-background-api.json` ใต้ working directory. หากติดตั้งแบบ copy `dist` อย่างเดียว ต้องนำ `workflows`, `scripts` และ dependencies ไปด้วย. Dockerfile รวม workflow ไว้แล้ว.

งานอยู่ในตาราง `thumbnail_editor.ai_jobs`; รูปที่บันทึกสำเร็จอยู่ใน assets/storage เดิม. สำรอง database และ storage คู่กัน. ตั้งค่า `API_KEY` และข้อมูลเชื่อม Phase 2 เหมือนเดิม.

## 3. อัปเกรด Vue

```powershell
cd D:\GitPoom\youtube-thumbnail-web
npm ci
npm run dev
```

เปิด http://127.0.0.1:5173 แล้วเชื่อม API พอร์ต 3002. ไม่ส่ง browser ไปหา ComfyUI โดยตรงและไม่ต้องตั้ง ComfyUI CORS.

## 4. ทำภาพปกจาก Raora

1. เลือกวิดีโอและเฟรม → ใช้ AI ตัดตัวละครจาก Phase 2 → เพิ่ม PNG เป็น Layer.
2. ใส่ข้อความไทย/โลโก้ใน Editor แล้วเปิด **AI สร้างพื้นหลัง**.
3. เลือก Horror/Funny/Cute/Epic, แก้ Prompt และจำนวนภาพ. ค่าเริ่มต้น 1024×576, steps 22, CFG 6, batch 1. สร้าง 3 ภาพทีละภาพด้วย seed เริ่มต้น, seed+1, seed+2.
4. กด **ตรวจ ComfyUI** เพื่อดูการเชื่อมต่อและ checkpoint แล้วกด **สร้างพื้นหลัง**. ปิด dialog หรือรีเฟรชเว็บได้; backend ยังทำงาน. เปิด Generator อีกครั้งเพื่อดู 30 งานล่าสุดของวิดีโอนั้น.
5. Gallery แสดงพรีวิวทั้งภาพปกโดยนำพื้นหลังมาซ้อนกับ Layer ปัจจุบัน. ค่าเริ่มต้นคงตำแหน่งเดิม; เปิด **จัดตำแหน่งตัวละครและหัวเรื่องอัตโนมัติ** เพื่อสลับตัวละครซ้าย/ขวาและจัดหัวเรื่อง. เลือก image layer ที่เป็นตัวละคร; หัวเรื่องจะแก้ text layer แรก หรือสร้างใหม่เมื่อยังไม่มี. Layer อื่นยังอยู่.
6. กด **ใช้แบบนี้ใน Editor** → แก้ตำแหน่ง/สี/ขนาดได้ → บันทึก Draft → Export JPG/PNG 1280×720. การเลือกภาพเป็นหนึ่งขั้น Undo; ยังไม่บันทึก Draft จนกดบันทึก.

AI รับเฉพาะ prompt สร้างพื้นหลัง ไม่ได้รับไฟล์ตัวละคร. Negative prompt ขอไม่ให้มีคนหรือข้อความ แต่ไม่รับประกันว่าโมเดลจะทำตามทั้งหมด: ตรวจภาพก่อนใช้. พื้นหลังเกมจริงยังเลือกใช้ได้ตามเดิม.

พื้นหลัง SDXL ถูกปรับเป็น 1280×720 ด้วย Sharp `fit: cover`. แบบ 1024×576 เป็น 16:9 อยู่แล้ว; แบบ 768×448 จะถูก crop ขอบบน/ล่างเล็กน้อย. ไม่ใช่ AI super-resolution. PNG ตัวละครคง asset ต้นฉบับ; ข้อความไทย render ด้วย Konva ไม่ให้ SDXL เขียน.

## คิว การติดตาม และการหยุดงาน

- ใช้ `/prompt`, `/history/:prompt_id`, `/queue` และ `/view` ของ ComfyUI. รุ่นนี้ poll history ทุกประมาณ 2 วินาที ไม่ใช้ WebSocket; UI แสดงจำนวนภาพที่นำเข้าครบแล้ว ไม่แสดงเปอร์เซ็นต์ sampling ที่คาดเดา.
- PostgreSQL advisory lock ประสานการเดินคิวระหว่าง Nest processes ที่ใช้ฐานข้อมูลเดียวกัน. หนึ่งภาพ batch 1 ต่อครั้ง; รอ ComfyUI queue ว่างก่อนส่งภาพถัดไป. ตั้งหลาย API ให้ใช้ COMFYUI_URL/checkpoint เดียวกัน. ไม่มีการประสานข้ามฐานข้อมูลหรือ GPU ระหว่างแอปอื่น.
- `requestId` ป้องกัน POST ซ้ำจากการ retry ฝั่งเว็บ. งานที่มี `promptId` จะกลับมาติดตาม history หลัง Nest restart โดยไม่สร้างใหม่.
- หาก process หยุดในช่วงส่ง prompt หรือการตอบกลับขาดหายจนไม่รู้ว่า ComfyUI รับแล้วหรือไม่ จะ mark failed พร้อมคำอธิบาย **ไม่ส่งซ้ำอัตโนมัติ**. ตรวจ Queue/History ใน ComfyUI ก่อนสร้างงานใหม่.
- ถ้า ComfyUI รีสตาร์ตแล้ว history หาย งานที่รอผลจะ timeout (ค่าเริ่มต้น 15 นาทีต่อภาพ รวมเวลาอยู่คิวหลังส่ง). ไม่สร้างใหม่เงียบ ๆ; ภาพก่อนหน้าที่เก็บสำเร็จยังใช้ได้.
- งานที่ยังไม่ส่งจะรอเมื่อ ComfyUI offline และหยุดได้. **หยุดหลังภาพปัจจุบัน** เก็บผลภาพปัจจุบันแล้วไม่ส่งรูปถัดไป; ไม่เรียก global `/interrupt` ซึ่งอาจหยุดงานอื่น.
- อาจมีไฟล์ที่ไม่อ้างอิงเหลือใน ComfyUI output หรือ assets หาก process ล่มกลางการบันทึก; ไม่มี garbage collection อัตโนมัติ.

## HTTP API

Base: `/api/v1/videos/:videoId/thumbnails/ai-backgrounds`, ใช้ `X-API-Key` เดิม.

| Method | Path ต่อจาก Base | หน้าที่ |
| --- | --- | --- |
| POST | ว่าง | สร้างงาน, HTTP 202 |
| GET | ว่าง | 30 งานล่าสุดของวิดีโอ |
| GET | `/health` | ตรวจ ComfyUI และ checkpoint |
| GET | `/:jobId` | สถานะ + input + state.assets/seeds/error |
| GET | `/:jobId/images` | `{items: Asset[]}` ของรูปที่เก็บแล้ว |
| POST | `/:jobId/cancel` | หยุดก่อนส่งรูปถัดไป |

```json
{
  "requestId": "สร้าง UUID ใหม่สำหรับแต่ละงาน",
  "style": "horror",
  "prompt": "Dark haunted hospital corridor",
  "negativePrompt": "",
  "variations": 3,
  "resolution": "standard",
  "steps": 22,
  "cfg": 6,
  "seed": 12345
}
```

`seed` optional; `resolution` standard/low; seed 0–2147483644, steps 10–30, CFG 1–10, variations 1–3. ไม่รับ workflow, URL หรือพาธเครื่องจาก browser. Node IDs ใน JSON: 3 sampler, 4 checkpoint, 5 latent, 6 positive, 7 negative, 8 decode, 9 save. ผล `/view` รับเฉพาะ descriptor จาก history และตรวจเป็น PNG/JPEG เดี่ยว ≤24MP/10MiB ก่อนบันทึก.

## หาก VRAM ไม่พอ / Docker

- เริ่ม batch 1 และไม่มี Refiner. เลือก 768×448 ในเว็บ, ปิดงาน GPU อื่น และคง rembg เป็น CPU.
- ลองเพิ่ม `--lowvram` ในคำสั่ง ComfyUI; ผลขึ้นกับ ComfyUI รุ่นและระบบ dynamic VRAM (บางรุ่น flag นี้ไม่มีผลเมื่อ dynamic VRAM เปิด). ไม่รับประกันเวลา/VRAM บน RTX 4060 จนทดสอบจริง.
- คู่มือหลักให้รันทั้ง API และ ComfyUI บน Windows host เพื่อใช้ loopback ได้ตรงกัน. ถ้า API อยู่ Docker, `127.0.0.1` หมายถึง container; ต้องใช้ `host.docker.internal:8188` ใน COMFYUI_URL และให้ ComfyUI รับบน interface ที่ container เข้าได้. การเปลี่ยนเป็น `--listen 0.0.0.0` เปิดบริการออกเครือข่ายด้วย ต้องตั้ง firewall ตามสภาพแวดล้อม. ComfyUI upstream ไม่ใช้ X-API-Key ของ Nest.
- Compose ของ API ส่งต่อ COMFYUI_* ให้แล้ว; ไม่มีการ bundle GPU ComfyUI เข้า compose. Workflow ใช้ built-in nodes ไม่ต้องติดตั้ง custom nodes.

## สิ่งที่ทดสอบแล้ว

API build + 32 tests และ Vue typecheck/build + 27 tests ผ่าน. ชุดใหม่ทดสอบ HTTP ComfyUI fixture, serial queue 3 ภาพ, seeds, 1280×720 asset import ด้วย Sharp จริง, cancel, restart, duplicate request, response loss, timeout, validation/ownership, เก็บไฟล์ล้มเหลวแล้วลองใหม่ และ Vue generator/composition flow.

Fixture จำลอง ComfyUI HTTP และใช้ pg-mem แทน PostgreSQL จริง; ไม่ใช่ผล inference จาก SDXL. ยังไม่ได้ทดสอบ SDXL บน RTX 4060, browser canvas จริง, Windows launcher, Docker หรือฐานข้อมูล/คลิปบนเครื่องคุณ. Unit tests ใช้ mock image decode/export ใน Vue. ไม่ได้รวม checkpoint หรือผลภาพ AI ตัวอย่างปลอมไว้ใน ZIP.

ทดสอบบนเครื่องจริง: Generate 1 ภาพ → ตรวจตัวละคร/ไทย/โลโก้ → ใช้แบบนี้ → บันทึก Draft → เปิด Draft ใหม่ → Export แล้วตรวจขนาด 1280×720; จากนั้นลอง 3 ภาพและปิด/เปิดหน้าเว็บระหว่างรอ. หากผิดพลาดส่งข้อความจากหน้า Generator กับ console ComfyUI มาตรวจต่อได้.

## เอกสารอ้างอิง

- [ComfyUI API routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [ComfyUI API workflow example](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py)
- [ComfyUI Windows Portable](https://docs.comfy.org/installation/comfyui_portable_windows)
- [SDXL Base 1.0 model card](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0)
- [ComfyUI CLI flags](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/cli_args.py)
