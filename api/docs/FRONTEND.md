# Vue 3 + Konva integration contract

Backend นี้เตรียมไว้สำหรับหน้า Editor ใหม่ ไม่ได้แก้ youtube-highlight-web เดิม

1. GET `/videos` เลือกวิดีโอและเก็บ videoId
2. POST `/videos/:videoId/thumbnails/frames` ด้วยเวลาตาม source MP4
3. เลือก frame asset เป็น background. Fetch asset bytes จาก backend origin แล้วใช้ blob URL โหลดรูป เพื่อรองรับ API key และหลีกเลี่ยง canvas taint
4. สร้าง canvas logical size 1280×720 และ text/image nodes. แสดงย่อด้วย container หรือ preview scale แต่ export ต้องได้ 1280×720 จริง
5. อัปโหลด PNG/JPEG ประกอบผ่าน `/images` และเก็บ assetId ใน document ไม่เก็บ blob URL, DOM หรือ serialized Konva internals
6. elements เรียงจากล่างไปบน. เมื่อ transform ให้ normalize scale ลงใน width/height หรือ fontSize แล้ว reset scale เป็น 1 ก่อนบันทึก (schema ไม่เก็บ scaleX/Y)
7. POST/PUT Draft ตาม JSON ใน `API.md`. GET ทีละ Draft เพื่อกลับมาแก้ต่อ
8. รอ `document.fonts.ready` และ image load ทุกชั้นก่อน export. ซ่อน transformer/selection nodes และ restore หลัง export
9. PNG: transparent ได้ / JPEG: กำหนด background สีทึบ. export offscreen stage ขนาดจริง 1280×720, scale=1, pixelRatio=1
10. POST ไฟล์ภาพสำเร็จรูปผ่าน `/exports` ถ้าต้องการเก็บบน server หรือดาวน์โหลดใน browser โดยตรง

## Fetch ภาพพร้อม key

```ts
const apiOrigin = 'http://127.0.0.1:3002';
const headers = apiKey ? { 'X-API-Key': apiKey } : {};
const response = await fetch(new URL(asset.url, apiOrigin), { headers });
if (!response.ok) throw new Error('Cannot load image');
const objectUrl = URL.createObjectURL(await response.blob());
const image = new Image();
image.src = objectUrl;
await image.decode();
// ส่ง image ให้ Konva.Image; revoke objectUrl เมื่อถอด node/ปิดหน้า
```

## อัปโหลดผลลัพธ์

```ts
// ใช้ stage สำหรับ export ที่มี width=1280,height=720,scale=1 เท่านั้น
await document.fonts.ready;
const blob = await stage.toBlob({ mimeType: 'image/jpeg', quality: 0.95, pixelRatio: 1 });
if (!blob) throw new Error('Canvas export failed');
const form = new FormData();
form.append('file', blob, 'thumbnail.jpg');
const response = await fetch(`${apiOrigin}/api/v1/videos/${videoId}/thumbnails/exports`, {
  method: 'POST', headers, body: form,
});
if (!response.ok) throw new Error(await response.text());
const exportedAsset = await response.json();
```

ฟอนต์ไทยเป็นหน้าที่ frontend ต้อง bundle/load ฟอนต์ที่มี glyph ไทยจริง เช่น Noto Sans Thai แล้วรอโหลดก่อนวัดข้อความและ export. Server เก็บชื่อฟอนต์ ไม่ติดตั้ง/เรนเดอร์ฟอนต์เอง.

เฟสนี้ไม่รวม AI background removal, generative background, AI frame ranking, upload ไป YouTube หรือ source-video upload.
