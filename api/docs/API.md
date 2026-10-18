# API contract v1

Base URL `http://127.0.0.1:3002/api/v1`. ตั้ง `X-API-Key` หากกำหนด `API_KEY` ใน server. JSON unknown fields ถูก reject.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | ตรวจ database/schema |
| GET | `/videos?limit=20&cursor=...` | รายการจาก API เดิม |
| GET | `/videos?limit=20&offset=0` | รายการโหมด database/local |
| GET | `/videos/:videoId` | ข้อมูลวิดีโอ |
| POST | `/videos` | ลงทะเบียนในโหมด local |
| POST | `/videos/:videoId/thumbnails/frames` | สกัดเฟรมจาก source |
| GET | `/videos/:videoId/thumbnails/frames?offset=0` | เฟรมที่บันทึกแล้ว |
| POST / GET | `/videos/:videoId/thumbnails/images` | อัปโหลด/รายการภาพประกอบ |
| POST / GET | `/videos/:videoId/thumbnails/exports` | อัปโหลด/รายการภาพปกสำเร็จรูป |
| POST / GET | `/videos/:videoId/thumbnails/drafts` | สร้าง/รายการ Draft |
| GET / PUT | `/videos/:videoId/thumbnails/drafts/:id` | เปิด/บันทึก Draft |
| DELETE | `/videos/:videoId/thumbnails/drafts/:id?revision=2` | ลบตาม revision ล่าสุด |
| GET | `/assets/:id/file` | แสดงภาพ |
| GET | `/assets/:id/file?download=1` | ดาวน์โหลดภาพ |

รายการ assets/drafts คืน `{items,nextOffset}` หน้าละ 50 รายการ รองรับ `offset`. รายการ drafts ไม่รวม document ให้ GET draft ตาม id ก่อนเปิดแก้ไข. รายการ videos ในโหมด api คืน `{items,nextCursor}` ตาม API เดิม โหมด database/local คืน `{items,nextOffset}`.

## เริ่มทดสอบด้วย PowerShell

```powershell
$api = 'http://127.0.0.1:3002/api/v1'
$videos = Invoke-RestMethod "$api/videos"
$videoId = $videos.items[0].id
$frames = Invoke-RestMethod "$api/videos/$videoId/thumbnails/frames" -Method Post -ContentType 'application/json' -Body '{"timestampsMs":[12000,18000,24000]}'
$frames.items
Invoke-WebRequest ("http://127.0.0.1:3002" + $frames.items[0].url) -OutFile frame.jpg
```

เลือกเวลาที่น้อยกว่าความยาว source จริง `timestampsMs` รับ integer 0..2147483647 จำนวน 1–12 ค่า. Response:

```json
{
  "items": [{
    "id": "<asset UUID>", "videoId": "<video ID>", "kind": "frame",
    "filename": "<asset UUID>.jpg", "mimeType": "image/jpeg",
    "width": 1280, "height": 720, "timestampMs": 18000,
    "sizeBytes": 123456, "url": "/api/v1/assets/<asset UUID>/file"
  }],
  "sourceDurationMs": 60000,
  "timeBase": "source-video"
}
```

## Draft JSON

POST `/videos/:videoId/thumbnails/drafts`:

```json
{
  "name": "Raora กรี๊ดลั่น",
  "document": {
    "version": 1, "width": 1280, "height": 720,
    "backgroundColor": "#151525",
    "backgroundAssetId": "<frame UUID>",
    "elements": [
      {
        "id": "title", "type": "text", "text": "กรี๊ดลั่น!!",
        "x": 80, "y": 440, "width": 1100, "height": 160,
        "fontFamily": "Noto Sans Thai", "fontSize": 100, "fontStyle": "bold",
        "fill": "#FFD700", "stroke": "#000000", "strokeWidth": 8,
        "shadowColor": "#000000", "shadowBlur": 12,
        "shadowOffsetX": 4, "shadowOffsetY": 4,
        "align": "left", "rotation": -4, "opacity": 1, "visible": true
      }
    ]
  }
}
```

แทน `<frame UUID>` ด้วย id จริง หรือเอา `backgroundAssetId` ออกเมื่อต้องการพื้นสีล้วน. สร้าง image layer ด้วย `type:"image", assetId:"<image UUID>"` พร้อม `id,x,y,width,height`. IDs ของ elements ต้องไม่ซ้ำ สีใช้ hex 6 หลักเท่านั้น; จำกัด 100 elements ต่อ Draft. Asset ต้องเป็น frame/image ของ video เดียวกัน.

PUT body เหมือน POST แต่เพิ่ม `revision` ระดับเดียวกับ `name`. ใช้ revision ที่ได้จาก GET ล่าสุด หลังบันทึก server เพิ่ม revision ให้เอง. ถ้าได้ 409 ให้โหลดใหม่และให้ผู้ใช้ตัดสินใจรวมการแก้ไข ห้าม retry ทับโดยอัตโนมัติ.

## อัปโหลดรูปและภาพปก

ใช้ `multipart/form-data` field `file` เท่านั้น ไม่กำหนด Content-Type เองเมื่อใช้ browser FormData.

```powershell
curl.exe -X POST "http://127.0.0.1:3002/api/v1/videos/VIDEO_ID/thumbnails/images" -F "file=@character.png"
curl.exe -X POST "http://127.0.0.1:3002/api/v1/videos/VIDEO_ID/thumbnails/exports" -F "file=@thumbnail.jpg"
```

Export ต้อง 1280×720 pixels. Endpoint รับภาพสำเร็จรูป ไม่ได้ render Draft JSON. Server decode/re-encode เพื่อตรวจชนิดและเอา metadata ออก JPEG อาจเปลี่ยน bytes เล็กน้อย. ภาพ PNG เก็บ transparency.

## Error handling

- 400: payload/ภาพ/เวลาไม่ถูกต้อง
- 401: API key ไม่ถูกต้อง
- 404: video, source file, draft, asset ไม่พบ
- 409: revision เก่าหรือ local externalId ซ้ำ
- 413: body/upload เกินขนาด
- 502: ติดต่อ highlight API ไม่ได้
- 503: extraction กำลังทำงาน, FFmpeg/FFprobe เปิดไม่ได้ หรือ timeout

หากกำหนด API_KEY แล้วเปิด `/docs` โดยตรง browser จะไม่มี header ให้ใช้ API client กับ contract นี้ หรือใช้ loopback development โดยไม่ตั้ง key. ไม่มี login/user roles ในรุ่น local นี้.


## Phase 2 — Background removal

ดู `../PHASE2.md` สำหรับ request/response และ worker setup.

- `GET /videos/:videoId/thumbnails/background-removal/health`
- `POST /videos/:videoId/thumbnails/remove-background` JSON `{sourceAssetId, crop:{x,y,width,height}}`
- Response `{source,cutout,crop,model}`; source/cutout เป็น image assets.
- Error 400 validation/source/crop, 404 asset, 502 invalid worker output, 503 unavailable/busy, 504 timeout.


## Phase 3 — AI Background Generator

ดู `../PHASE3.md` สำหรับ contract, validation, คิวและการติดตั้ง ComfyUI. API ใหม่มี base `/videos/:videoId/thumbnails/ai-backgrounds`; POST สร้างงานตอบ 202, GET ติดตามงานและภาพ. ต้อง migrate ตาราง `thumbnail_editor.ai_jobs` ก่อนเปิด API.
