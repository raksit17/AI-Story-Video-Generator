# Phase 2 — HoloMoment TH (0.2.0)

## อัปเกรดจาก Phase 1

แยก ZIP เป็นโฟลเดอร์ `youtube-thumbnail-ai`, `youtube-thumbnail-web`, `youtube-thumbnail-api` ข้างกัน. สำรอง source เดิมก่อนแทนที่; เก็บ `.env`, database และ `storage` เดิมไว้. ไม่ต้อง migration เพิ่มสำหรับ Phase 2: ใช้ assets ชนิด image และ Draft version 1 เดิม. หากติดตั้งครั้งแรก ให้ทำตาม README ของ API เพื่อสร้าง schema.

ต้องมี Python 3.12, Node.js 22.12+, PostgreSQL, FFmpeg/FFprobe. เปิดสาม terminal ตามลำดับด้านล่าง. AI รันในเครื่อง ไม่มีบริการสร้างภาพภายนอก; ครั้งแรกดาวน์โหลด model weights ประมาณ 176 MB จาก upstream rembg.

## 1. FastAPI — พอร์ต 8001 (PowerShell)

```powershell
cd D:\GitPoom\youtube-thumbnail-ai
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

ตั้ง `WORKER_API_KEY` เป็น secret ที่คุณเลือก; `DEVICE=cpu`. จากนั้น:

```powershell
.venv\Scripts\python -m app.warmup
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 1
```

Linux/macOS ใช้ `python3.12 -m venv .venv` และ `.venv/bin/python`. รันจากโฟลเดอร์ worker เสมอเพื่อโหลด `.env` และใช้ `models` cache เดิม. Warmup โหลดโมเดลไว้ในดิสก์; Uvicorn สร้าง session ในหน่วยความจำของตนเมื่อรับงานแรก. อย่าใช้ `--reload`/หลาย workers สำหรับงานจริง.

## 2. NestJS — พอร์ต 3002

คงค่า `.env` เดิมและเพิ่ม:

```dotenv
REMOVAL_WORKER_URL=http://127.0.0.1:8001
REMOVAL_WORKER_KEY=ใส่ค่าเดียวกับ_WORKER_API_KEY
REMOVAL_TIMEOUT_MS=180000
```

```powershell
cd D:\GitPoom\youtube-thumbnail-api
npm ci
npm run build
npm start
```

`API_KEY` ใช้สำหรับเว็บ → NestJS ส่วน `REMOVAL_WORKER_KEY` ใช้ NestJS → Worker เป็นคนละค่าได้. ไม่ใส่ worker secret ในเว็บ. หากใช้ Nginx/proxy ตั้ง read timeout ให้มากกว่า REMOVAL_TIMEOUT_MS.

## 3. Vue — พอร์ต 5173

```powershell
cd D:\GitPoom\youtube-thumbnail-web
npm ci
npm run dev
```

เปิด http://127.0.0.1:5173 เชื่อม API `/api/v1` ผ่าน Vite proxy หรือ URL ที่ตั้งใน README. กรอก API key ของ NestJS เมื่อมีการตั้งไว้.

## วิธีใช้

1. เลือกวิดีโอ ดึงเฟรม แล้วตั้งเฟรมเป็นพื้นหลัง (หรือเลือก image layer ที่ต้องการตัด).
2. กด **AI ตัดตัวละคร** → ลาก/ปรับกรอบ Crop ให้ล้อมตัวละคร หรือกรอก X/Y/width/height. ขนาดกรอบ 8–2048 px ต่อด้าน.
3. กด **AI ตัดพื้นหลัง** รอประมวลผล; ถ้า Worker ไม่พร้อมหรือ timeout จะมีข้อความและลองใหม่ได้.
4. ดู PNG บนตารางโปร่งใส ใช้ **Erase / Restore** ปรับขอบ, Undo/Redo หรือ Reset กลับผล AI. Restore คืน RGB/alpha จากภาพ Crop ต้นฉบับ จึงกู้รายละเอียดที่ AI ตัดทิ้งได้.
5. กด **PNG โปร่งใส** เพื่อดาวน์โหลดตัวละคร หรือ **เพิ่มตัวละครเป็น Layer**. เลื่อน/ย่อขยาย/หมุน และปรับสีเส้นขอบ/เงาทางขวา.
6. บันทึก Draft แล้ว Export ภาพปก JPG/PNG 1280×720 ตาม Phase 1. ภาพตัวละครมี alpha; ภาพปกใช้สีพื้นหลังของ canvas.

เส้นขอบภาพใช้การขยาย alpha แบบ square max filter; ความกว้างกำหนดในพิกเซลภาพต้นฉบับและย่อ/ขยายตาม Layer. การแก้ Mask ยังไม่ autosave จนกดเพิ่มเป็น Layer; การดาวน์โหลด PNG ไม่บันทึก Draft. API เก็บทั้ง crop ต้นฉบับและ cutout ใน Images; การแก้ Mask แล้วบันทึกสร้าง asset ใหม่. ไม่มีระบบล้าง assets ที่ไม่ใช้โดยอัตโนมัติ.

## API contract

ใช้ API แบบ video-scoped แทนตัวอย่าง multipart ที่ root เพื่อให้ NestJS ตรวจภาพที่เก็บอยู่และความสัมพันธ์กับวิดีโอก่อนส่ง Worker:

```http
POST /api/v1/videos/:videoId/thumbnails/remove-background
X-API-Key: <ถ้าตั้งไว้>
Content-Type: application/json

{"sourceAssetId":"UUID ของ frame/image","crop":{"x":800,"y":100,"width":400,"height":600}}
```

Response: `{ "source": Asset, "cutout": Asset, "crop": {...}, "model": "isnet-anime" }`. แต่ละ Asset ใช้ `/api/v1/assets/:id/file` พร้อม API key เดิม. NestJS crop ด้วย Sharp; ไม่รับ URL หรือ server path จากผู้ใช้. ผล Worker ต้องเป็น PNG มี alpha ขนาดตรงกับ crop และไม่เกิน 10 MiB. หากบันทึกตัวที่สองล้มเหลวจะพยายามลบตัวแรก.

ตรวจ Worker ผ่าน `GET /api/v1/videos/:videoId/thumbnails/background-removal/health`. Worker รับ `POST /remove-background` แบบ multipart field `file` พร้อม `X-Worker-Key`; `GET /health` ใช้ key เดียวกัน. Worker จำกัด 10 MiB, PNG/JPEG เดี่ยว, สูงสุด 2048×2048; หนึ่ง inference ต่อ process. รับงานซ้อนตอบ 503 ไม่เข้าคิว. การยกเลิก HTTP ไม่ปลดล็อกจน inference จริงจบ.

## Docker CPU แบบแยกบริการ

วางโฟลเดอร์ worker ข้าง API แล้วตั้ง `API_KEY` และ `REMOVAL_WORKER_KEY` ใน `.env` ของ API. รันจากโฟลเดอร์ API: `docker compose -f compose.yaml -f compose.phase2.yaml up --build`. override จะใช้ `http://worker:8001` ภายใน network; worker ไม่มีพอร์ตเปิดออก host. Compose ตัวอย่างใช้ database ใหม่และโหมด local ตาม README.

## GPU ภายหลัง

CPU เป็นค่าเริ่มต้นที่ทดสอบแล้ว. สำหรับ RTX 4060 สร้าง venv แยก, ติดตั้ง dependencies เดิม แล้วเอา `onnxruntime` CPU ออกและติดตั้ง `onnxruntime-gpu`. ตั้ง `DEVICE=cuda`; CUDA/cuDNN ต้องตรงกับ onnxruntime-gpu ที่ติดตั้ง. ดู [ข้อกำหนด CUDA ของ ONNX Runtime](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html) และ [rembg](https://github.com/danielgatis/rembg). ตรวจ `/health` หลัง inference ว่ามี `CUDAExecutionProvider`; worker จะปฏิเสธ silent CPU fallback หาก CUDA session เปิดไม่ได้. ยังไม่ได้ทดสอบ GPU/VRAM บน RTX 4060 จริง.

## การตรวจสอบและข้อจำกัด

- API: build และ tests รวม HTTP validation, Sharp crop, ownership, worker failure และ rollback ผ่าน.
- Web: typecheck/build และ tests รวม mask restore และ outline dilation ผ่าน; Vue tests ใช้ API fixtures/canvas stubs.
- Worker: tests ตรวจไฟล์, auth, size, lock, response ผ่าน. โหลด isnet-anime และทดสอบ FastAPI → inference จริงบน CPU ด้วยภาพสังเคราะห์ ได้ RGBA PNG ขนาดเดิม.
- ยังไม่ได้ทดสอบ end-to-end ทั้งสามบริการกับฐานข้อมูล/MP4 ของคุณ, UI ใน browser จริง, หรือคุณภาพขอบ Raora จากเฟรมจริง. ต้องลองกับคลิปจริงก่อนสรุปคุณภาพ AI. ไม่ได้รัน Docker/GPU ในชุดทดสอบนี้.
- ระบบยังใช้ shared API key แบบ Phase 1 ไม่มีบัญชีผู้ใช้/สิทธิ์แยกรายคน; เหมาะกับการรันในเครื่องตาม host ค่าเริ่มต้น.
