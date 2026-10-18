# YouTube Thumbnail API — Phase 3

**รุ่น 0.3.0: อ่าน PHASE3.md ก่อนอัปเกรด — ต้องรัน `npm run db:migrate` ใน API และเปิด ComfyUI + SDXL เพิ่ม. Phase 2 worker เดิมใช้ต่อได้.**

NestJS backend ใหม่สำหรับ HoloMoment TH: เลือกวิดีโอ → ดึงเฟรม → เก็บภาพประกอบ → บันทึก Draft → รับ/ดาวน์โหลด PNG หรือ JPG ที่หน้าเว็บ export

Backend สำหรับ Vue/Konva Editor พร้อม AI Remove Background ผ่าน FastAPI Worker. ดู **PHASE2.md** สำหรับการอัปเกรดและการเปิดทั้งสามโปรเจกต์. ไม่ render ข้อความบน server; browser สร้างภาพปก 1280×720 แล้วดาวน์โหลดหรืออัปโหลดผ่าน `/exports`.

## เชื่อมกับโปรเจกต์เดิมอย่างไร

ตรวจสอบจาก `raksit17/youtube-highlight-api` commit `8769d5a7b6d3775bec20be19380d18e44efe4024`:

- ใช้ video `id`, `externalId`, `title`, `durationMs` และ `/api/v1/videos` ของเดิมได้
- อ่านไฟล์ `<externalId>.mp4` หรือ `<videoId>.mp4` ตามแนวทาง source resolver เดิม รองรับ `.webm`, `.mkv`, `.mov`, `.m4v` ด้วย
- เริ่ม NestJS ใหม่ ไม่คัดลอก ingestion/chat/transcript/analysis/render worker ทั้งระบบ
- เขียนเฉพาะ `thumbnail_editor.local_videos`, `thumbnail_editor.assets`, `thumbnail_editor.drafts`
- ใช้ PostgreSQL database เดียวกับของเดิมได้ แต่แยก schema ชัดเจน ไม่มี migration ไปแตะ `public.videos` หรือข้อมูลเดิม
- ใช้ `pg` และ SQL แบบ parameterized ในโปรเจกต์ใหม่นี้ เพื่อแยกการจัดการ schema ออกจาก Prisma migrations ของโปรเจกต์เดิม ไม่ต้องเปลี่ยน Prisma ของเดิม

## เริ่มรันบน Windows (PowerShell)

ต้องมี Node.js 22+, PostgreSQL และ FFmpeg/FFprobe

```powershell
cd D:\GitPoom\youtube-thumbnail-api
npm ci
Copy-Item .env.example .env
```

แก้ `.env` ให้ตรงเครื่อง โดยใช้ฐานข้อมูลเดิมได้:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/youtube_highlight
VIDEO_CATALOG_MODE=api
HIGHLIGHT_API_URL=http://127.0.0.1:3001/api/v1
VIDEO_SOURCE_DIR=D:/GitPoom/youtube-highlight-api/storage/sources
FFMPEG_PATH=C:/Users/raksi/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe
FFPROBE_PATH=C:/Users/raksi/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe
PORT=3002
HOST=127.0.0.1
```

ตรวจว่า `ffprobe.exe` มีอยู่จริงด้วย `Get-Command ffprobe` ถ้า path ต่างออกไปให้ใช้ path ที่พบ

```powershell
npm run db:migrate
npm run start:dev
```

- API: http://127.0.0.1:3002/api/v1
- Health: http://127.0.0.1:3002/api/v1/health
- Swagger route explorer: http://127.0.0.1:3002/docs (ตัวอย่าง body เต็มอยู่ใน `docs/API.md`)
- Production: `npm run build` แล้ว `npm start`

`db:migrate` สร้าง schema/tables ใหม่แบบ idempotent พร้อม transaction เท่านั้น ไม่สร้าง database; database ที่ระบุต้องมีอยู่แล้ว ห้ามนำ Prisma schema ของโปรเจกต์ใหม่นี้ไป migrate ของเดิม — โปรเจกต์นี้ไม่ได้ใช้ Prisma

## เลือกที่มาของวิดีโอ

| VIDEO_CATALOG_MODE | ที่มาของรายการวิดีโอ | ต้องเปิด API เดิมไหม |
| --- | --- | --- |
| `api` (ค่าเริ่มต้น) | `HIGHLIGHT_API_URL/videos` | ต้องเปิด |
| `database` | `public.videos` ผ่าน `HIGHLIGHT_DATABASE_URL` แบบ read-only | ไม่ต้อง |
| `local` | ตาราง `thumbnail_editor.local_videos` ของโปรเจกต์นี้ | ไม่ต้อง |

โหมด database ตั้ง `HIGHLIGHT_DATABASE_URL` เป็นฐานข้อมูลเดิม โดยแนะนำ user ที่มี SELECT เท่านั้น การเชื่อมต่อฝั่งนี้ตั้ง `default_transaction_read_only=on` เพิ่มไว้แล้ว ส่วน `DATABASE_URL` เป็น connection ที่เขียน schema `thumbnail_editor` ได้ จะเป็น database เดียวกันหรือแยกกันก็ได้

โหมด local เรียก `POST /videos` ด้วย `{ "externalId": "raora-highlight", "title": "Raora highlight" }` แล้ววาง `raora-highlight.mp4` ใน `VIDEO_SOURCE_DIR` การลงทะเบียนไม่อัปโหลด MP4 และไม่คัดลอกไฟล์

## เวลาของเฟรม — สำคัญ

Request ใช้ **`timestampsMs` เป็นมิลลิวินาที** ไม่ใช่ `timestamps` วินาที เพื่อสอดคล้องกับ `startMs` / `peakMs` ของ highlight เดิม

```json
{ "timestampsMs": [12000, 18000, 24000] }
```

เวลานับจากจุดเริ่มต้นของ **ไฟล์ source ที่เลือก** เสมอ หากใช้คลิปต้นฉบับยาวและ ClipDraft เริ่มที่ 600000 ms การเลือกวินาทีที่ 18 ของ ClipDraft ต้องส่ง `618000` ไม่ใช่ `18000`

ถ้าต้องการทำปกจาก MP4 ที่ตัดเสร็จแล้ว ให้ใช้โหมด local ลงทะเบียน externalId ใหม่ที่ตรงกับชื่อ MP4 นั้น เวลาจะเริ่ม 0 ตามคลิปที่ตัดแล้ว รุ่นนี้ยังไม่ค้นหาไฟล์จาก RenderJob อัตโนมัติ

FFprobe ตรวจ duration จริง ไม่ใช้ duration ที่อาจเก่าใน database ภาพเป็น 1280×720 และใส่ขอบเมื่ออัตราส่วนต่างจาก 16:9 โดยไม่บิดภาพ

## ฟีเจอร์และขอบเขต

- ดึง 1–12 เฟรมต่อ request, เรียงเวลาและตัดค่าซ้ำ
- รับ PNG/JPEG ประกอบ (รวม PNG โปร่งใส), ตรวจเนื้อหาไฟล์จริง, สูงสุด 10 MiB/ไฟล์และ 24 ล้านพิกเซล
- เก็บ Draft JSON: ข้อความไทย ฟอนต์ สี stroke shadow ตำแหน่ง ขนาด หมุน ความโปร่งใส และลำดับชั้น (ลำดับใน `elements` = ล่าง → บน)
- อ่าน/แก้/ลบ Draft พร้อม optimistic revision ป้องกันสองหน้าบันทึกทับกัน
- รับภาพปกสำเร็จรูป 1280×720 PNG/JPEG และดาวน์โหลดได้
- ส่ง URL เป็น relative path; frontend ต่อกับ API origin ไม่ใช่ frontend origin
- หนึ่ง extraction request ต่อ process ขณะทำงาน request ถัดไปได้ HTTP 503 ให้รอแล้ว retry
- งาน extraction ทำแบบ synchronous; สูงสุด 60 วินาทีต่อเฟรม ไม่ใช่ background queue ตั้ง proxy/client timeout ให้พอกับ batch หรือเริ่มจาก 3 เฟรม
- ไฟล์ metadata อยู่ใน PostgreSQL ส่วน bytes อยู่ใน `STORAGE_DIR/assets` ต้อง backup ทั้งสองส่วน
- ลบ Draft ไม่ลบ assets; รุ่นนี้ไม่มี asset deletion/garbage collection และไม่มี multi-user ownership
- ไม่ใช้ GPU; FFmpeg ในเฟสนี้ทำงานด้วย CPU

## Frontend

ใช้ `youtube-thumbnail-web` รุ่น 0.2.0 สำหรับ Crop, Mask Editor, Layer และ Export; Draft schema version 1 ยังใช้ร่วมกับ Phase 1 ได้.

## Docker (ทดลองแยกจากฐานข้อมูลเดิม)

```powershell
New-Item -ItemType Directory -Force storage/sources
# เปลี่ยน API_KEY ใน .env เป็นค่าของคุณก่อน
# ใน compose ต้องมี API_KEY (เช่น generated random string)
docker compose up --build
```

Compose ใช้ PostgreSQL ใหม่ชื่อ `thumbnail` และโหมด local โดยไม่เปิด port PostgreSQL ออก host ไฟล์ต้นฉบับอยู่ `./storage/sources` และผลลัพธ์อยู่ Docker volume ต้องส่ง `X-API-Key` กับทุก request

## ทดสอบ

```powershell
npm test
npm run build
```

Integration tests ใช้ PostgreSQL emulator (`pg-mem`) พร้อม Nest HTTP จริง และเรียก FFmpeg/FFprobe จริงสร้างวิดีโอทดสอบ ตรวจ frame dimensions, validation, PNG transparency, export, Draft revision conflict, source path containment และ API key ไม่ต้องเปิด database จริงเพื่อรันชุดทดสอบนี้

## สร้าง repository ใหม่

ไม่มีการแก้หรือ push กลับ `youtube-highlight-api` เดิม โฟลเดอร์นี้ไม่มีประวัติ git ของ repo เดิม

ถ้ามี GitHub CLI ที่ login แล้ว:

```powershell
git init -b main
git add .
git commit -m "feat: initialize standalone thumbnail editor API"
gh repo create raksit17/youtube-thumbnail-api --private --source=. --remote=origin --push
```

หรือสร้าง empty private repo ชื่อ `youtube-thumbnail-api` ผ่าน GitHub แล้ว:

```powershell
git remote add origin https://github.com/raksit17/youtube-thumbnail-api.git
git push -u origin main
```

`.env`, `storage`, `node_modules`, `dist` ถูก ignore แล้ว ไม่ใส่รหัสผ่านหรือคลิปวิดีโอใน Git
