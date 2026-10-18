<script setup lang="ts">
import { computed, ref } from "vue";
import {
  X,
  Sparkles,
  Download,
  Plus,
  LoaderCircle,
  Check,
} from "lucide-vue-next";
import CropCanvas from "./CropCanvas.vue";
import MaskEditor from "./MaskEditor.vue";
import { ApiClient } from "../services/api";
import type { Asset, Crop, RemovalResult } from "../types";
import { download } from "../lib/editor";
const props = defineProps<{
  asset: Asset;
  image: HTMLImageElement;
  api: ApiClient;
  videoId: string;
}>();
const emit = defineEmits<{
  close: [];
  assets: [assets: Asset[]];
  apply: [asset: Asset];
}>();
const crop = ref<Crop>({
  x: 0,
  y: 0,
  width: Math.min(2048, props.image.naturalWidth),
  height: Math.min(2048, props.image.naturalHeight),
});
const result = ref<RemovalResult | null>(null),
  sourceImage = ref<HTMLImageElement>(),
  cutoutImage = ref<HTMLImageElement>(),
  mask = ref<InstanceType<typeof MaskEditor>>();
const busy = ref(""),
  error = ref(""),
  edited = ref(false);
const ready = computed(
  () => result.value && sourceImage.value && cutoutImage.value,
);
function close() {
  if (busy.value) return;
  if (
    edited.value &&
    !window.confirm("ทิ้งการแก้ Mask ที่ยังไม่ได้เพิ่มเป็น Layer หรือไม่?")
  )
    return;
  emit("close");
}
function changeCrop(key: keyof Crop, event: Event) {
  const next = {
    ...crop.value,
    [key]: Math.round(Number((event.target as HTMLInputElement).value)),
  };
  next.width = Math.max(
    8,
    Math.min(2048, props.image.naturalWidth, next.width),
  );
  next.height = Math.max(
    8,
    Math.min(2048, props.image.naturalHeight, next.height),
  );
  next.x = Math.max(0, Math.min(props.image.naturalWidth - next.width, next.x));
  next.y = Math.max(
    0,
    Math.min(props.image.naturalHeight - next.height, next.y),
  );
  if (Object.values(next).every(Number.isFinite)) crop.value = next;
}
async function imageFor(asset: Asset) {
  const blob = await props.api.blob(asset.id),
    url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function process() {
  busy.value = "AI กำลังตัดพื้นหลัง…";
  error.value = "";
  try {
    const response = await props.api.removeBackground(
      props.videoId,
      props.asset.id,
      crop.value,
    );
    result.value = response;
    emit("assets", [response.source, response.cutout]);
    [sourceImage.value, cutoutImage.value] = await Promise.all([
      imageFor(response.source),
      imageFor(response.cutout),
    ]);
    edited.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = "";
  }
}
async function retryPreview() {
  if (!result.value) return;
  busy.value = "กำลังโหลดพรีวิว";
  error.value = "";
  try {
    [sourceImage.value, cutoutImage.value] = await Promise.all([
      imageFor(result.value.source),
      imageFor(result.value.cutout),
    ]);
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = "";
  }
}
async function apply() {
  if (!result.value || !mask.value) return;
  busy.value = "กำลังบันทึกตัวละคร";
  error.value = "";
  try {
    let asset = result.value.cutout;
    if (edited.value) {
      asset = await props.api.upload(
        props.videoId,
        "images",
        await mask.value.blob(),
        "character-refined.png",
      );
      emit("assets", [asset]);
    }
    edited.value = false;
    emit("apply", asset);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = "";
  }
}
async function png() {
  if (!mask.value) return;
  busy.value = "กำลังสร้าง PNG";
  try {
    download(await mask.value.blob(), "character-transparent.png");
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = "";
  }
}
function recrop() {
  if (edited.value && !window.confirm("ทิ้งการแก้ Mask แล้ว Crop ใหม่หรือไม่?"))
    return;
  result.value = null;
  sourceImage.value = undefined;
  cutoutImage.value = undefined;
  edited.value = false;
}
</script>
<template>
  <div class="modal-backdrop removal-backdrop">
    <section
      class="removal-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="removal-title"
    >
      <div class="section-heading">
        <div>
          <span class="eyebrow">PHASE 02 · CHARACTER CUTOUT</span>
          <h2 id="removal-title"><Sparkles :size="20" />แยกตัวละครออกจากฉาก</h2>
        </div>
        <button
          class="icon-button"
          :disabled="!!busy"
          @click="close"
          aria-label="ปิด AI Editor"
        >
          <X :size="21" />
        </button>
      </div>
      <div class="removal-steps">
        <span :class="{ active: !result }">01 เลือกบริเวณตัวละคร</span
        ><span>→</span
        ><span :class="{ active: !!result }">02 เก็บรายละเอียด Mask</span
        ><span>→</span><span>03 เพิ่มเป็น Layer</span>
      </div>
      <div v-if="error" class="alert error" role="alert">{{ error }}</div>
      <template v-if="!result"
        ><p class="small-note">
          ลากกรอบล้อมตัวละคร ดึงขอบเพื่อปรับขนาด หรือกรอกพิกัด · Crop สูงสุด
          2048×2048
        </p>
        <CropCanvas
          :image="image"
          :crop="crop"
          :disabled="!!busy"
          @change="crop = $event"
        />
        <div class="crop-fields">
          <label
            v-for="field in ['x', 'y', 'width', 'height'] as const"
            :key="field"
            >{{ field
            }}<input
              type="number"
              :value="crop[field]"
              :disabled="!!busy"
              @change="changeCrop(field, $event)"
          /></label>
        </div>
        <div class="removal-footer">
          <p>
            isnet-anime · ประมวลผลผ่าน Worker บนเครื่องคุณ<br /><small
              >ครั้งแรกควรโหลดโมเดลล่วงหน้าด้วยคำสั่ง warmup</small
            >
          </p>
          <button class="button purple" :disabled="!!busy" @click="process">
            <LoaderCircle v-if="busy" class="spin" :size="17" /><Sparkles
              v-else
              :size="17"
            />{{ busy || "AI ตัดพื้นหลัง" }}
          </button>
        </div></template
      ><template v-else-if="ready"
        ><MaskEditor
          ref="mask"
          :source="sourceImage!"
          :cutout="cutoutImage!"
          :disabled="!!busy"
          @edited="edited = true"
        />
        <div class="removal-footer">
          <button class="button ghost" :disabled="!!busy" @click="recrop">
            Crop ใหม่
          </button>
          <div class="tool-group">
            <button class="button ghost" :disabled="!!busy" @click="png">
              <Download :size="16" />PNG โปร่งใส</button
            ><button class="button purple" :disabled="!!busy" @click="apply">
              <LoaderCircle v-if="busy" :size="17" class="spin" /><Plus
                v-else
                :size="17"
              />เพิ่มตัวละครเป็น Layer
            </button>
          </div>
        </div></template
      ><template v-else
        ><p class="small-note">สร้างภาพแล้ว กำลังโหลดพรีวิว</p>
        <button class="button ghost" :disabled="!!busy" @click="retryPreview">
          โหลดพรีวิวอีกครั้ง
        </button></template
      >
    </section>
  </div>
</template>
