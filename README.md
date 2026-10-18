# AI Story Video Generator

ระบบสร้างวิดีโอเล่าเรื่องจาก Prompt เดียว ตั้งแต่บทและสตอรี่บอร์ด ภาพประกอบ เสียงพากย์ ไปจนถึงไฟล์ที่เตรียมตรวจทานก่อนลง YouTube

## โครงสร้าง

- `web/` — Vue 3 + TypeScript; พื้นฐานจากโปรเจกต์ YouTube Thumbnail Web ที่แนบมา
- `api/` — NestJS API; พื้นฐานจากโปรเจกต์ YouTube Thumbnail API ที่แนบมา
- `comfyui/` — workflow และสคริปต์ ComfyUI สำหรับสร้างภาพ
- `PHASES.md` — ขอบเขตงาน Phase 1–4 และสถานะ

## เริ่มต้น

ดูวิธีติดตั้งและตัวแปรสภาพแวดล้อมใน README ของแต่ละส่วนก่อนเริ่มใช้งาน:

- [Web](web/README.md)
- [API](api/README.md)
- [ComfyUI](comfyui/README.md)
- [Projects, character continuity, and MOSS voices](docs/STORY_PROJECTS_VOICES.md)

โปรเจกต์ต้นทางทั้งสามถูกเก็บไว้ในแต่ละโฟลเดอร์เพื่อให้ตรวจสอบและต่อยอดได้ ไฟล์แนบเป็นแนวคิดอ้างอิง ส่วนขอบเขตของงานยึดตามคำขอของผู้ใช้: ทำวิดีโอจากภาพและเนื้อเรื่องให้ครบถึง Phase 4

## ข้อมูลสำคัญ

ก่อนใช้บริการสร้างภาพ เสียง หรือ YouTube ให้ตั้งค่าคีย์ API และ OAuth ของบัญชีตนเองในไฟล์ environment ตามตัวอย่าง ห้ามใส่ secret ลงใน source control
