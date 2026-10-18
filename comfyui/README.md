# HoloMoment TH — ComfyUI setup kit (Phase 3 / 0.3.0)

ชุดนี้มี workflow, คำสั่งเปิด ComfyUI Portable และเครื่องมือตรวจการเชื่อมต่อ. **ไม่ได้รวม ComfyUI, Python, CUDA หรือ SDXL checkpoint**. ตัวควบคุมคิวอยู่ใน `youtube-thumbnail-api`; หน้า Generator อยู่ใน `youtube-thumbnail-web`. ใช้ `youtube-thumbnail-ai` รุ่น Phase 2 เดิมสำหรับตัดพื้นหลังได้ต่อ.

เริ่มที่ **PHASE3.md**: ติดตั้ง ComfyUI → วาง checkpoint → เปิดพอร์ต 8188 → ตั้ง NestJS → `npm run db:migrate` → เปิดเว็บ.

- `sdxl-background-api.json`: workflow แบบ API (built-in nodes เท่านั้น)
- `start-comfyui.ps1`: เปิด Windows Portable จาก path ที่กำหนด
- `check-comfyui.mjs`: ตรวจ checkpoint และสถานะคิวด้วย Node.js 22

สำเนา workflow ที่ NestJS ใช้จริงอยู่ `youtube-thumbnail-api/workflows/sdxl-background-api.json`. หากเปลี่ยน node IDs ต้องปรับ `src/ai/comfyui.service.ts` และ node 9 ใน `ai-generation.service.ts` ให้ตรงกัน.
