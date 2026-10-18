<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Eraser, Paintbrush, Undo2, Redo2, RotateCcw } from "lucide-vue-next";
import { alphaChannel, applyAlpha, paintAlpha } from "../lib/mask";
const props = defineProps<{
  source: HTMLImageElement;
  cutout: HTMLImageElement;
  disabled: boolean;
}>();
const emit = defineEmits<{ edited: [] }>();
const canvas = ref<HTMLCanvasElement>(),
  mode = ref<"erase" | "restore">("erase"),
  brush = ref(24),
  before = ref(false),
  theme = ref("checker");
const undoIndex = ref(0),
  undoCount = ref(1);
let sourceData: Uint8ClampedArray,
  originalAlpha: Uint8ClampedArray,
  initial: Uint8ClampedArray,
  alpha: Uint8ClampedArray;
let history: Uint8ClampedArray[] = [],
  drawing = false,
  last: { x: number; y: number } | null = null;
const width = props.source.naturalWidth,
  height = props.source.naturalHeight;
function draw() {
  const ctx = canvas.value!.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (before.value) {
    ctx.drawImage(props.source, 0, 0);
    return;
  }
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(applyAlpha(sourceData, alpha)),
      width,
      height,
    ),
    0,
    0,
  );
}
function snapshot() {
  history = history.slice(0, undoIndex.value + 1);
  history.push(alpha.slice());
  if (history.length > 12) history.shift();
  undoIndex.value = history.length - 1;
  undoCount.value = history.length;
  emit("edited");
}
function undo() {
  if (undoIndex.value > 0) {
    alpha = history[--undoIndex.value].slice();
    draw();
    emit("edited");
  }
}
function redo() {
  if (undoIndex.value < history.length - 1) {
    alpha = history[++undoIndex.value].slice();
    draw();
    emit("edited");
  }
}
function reset() {
  alpha = initial.slice();
  snapshot();
  draw();
}
function point(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * width) / r.width,
    y: ((e.clientY - r.top) * height) / r.height,
  };
}
function stroke(p: { x: number; y: number }) {
  const from = last ?? p,
    steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(p.x - from.x, p.y - from.y) / Math.max(1, brush.value / 3),
      ),
    );
  for (let i = 1; i <= steps; i++)
    paintAlpha(
      alpha,
      originalAlpha,
      width,
      height,
      from.x + ((p.x - from.x) * i) / steps,
      from.y + ((p.y - from.y) * i) / steps,
      brush.value,
      mode.value,
    );
  last = p;
  draw();
}
function down(e: PointerEvent) {
  if (props.disabled || before.value) return;
  e.preventDefault();
  drawing = true;
  last = null;
  canvas.value!.setPointerCapture(e.pointerId);
  stroke(point(e));
}
function move(e: PointerEvent) {
  if (drawing) stroke(point(e));
}
function up() {
  if (!drawing) return;
  drawing = false;
  last = null;
  snapshot();
}
onMounted(() => {
  const c = canvas.value!;
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(props.source, 0, 0);
  sourceData = ctx.getImageData(0, 0, width, height).data;
  originalAlpha = alphaChannel(sourceData);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(props.cutout, 0, 0);
  initial = alphaChannel(ctx.getImageData(0, 0, width, height).data);
  alpha = initial.slice();
  history = [alpha.slice()];
  draw();
});
async function blob(): Promise<Blob> {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  output
    .getContext("2d")!
    .putImageData(
      new ImageData(
        new Uint8ClampedArray(applyAlpha(sourceData, alpha)),
        width,
        height,
      ),
      0,
      0,
    );
  return new Promise((resolve, reject) =>
    output.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Cannot export mask"))),
      "image/png",
    ),
  );
}
defineExpose({ blob });
</script>
<template>
  <div class="mask-editor">
    <fieldset :disabled="disabled" class="mask-tools">
      <button
        :class="{ active: mode === 'erase' }"
        @click="
          mode = 'erase';
          before = false;
          draw();
        "
      >
        <Eraser :size="16" />Erase</button
      ><button
        :class="{ active: mode === 'restore' }"
        @click="
          mode = 'restore';
          before = false;
          draw();
        "
      >
        <Paintbrush :size="16" />Restore</button
      ><label
        >ขนาดแปรง {{ brush }} px<input
          v-model.number="brush"
          type="range"
          min="1"
          max="100" /></label
      ><button
        :disabled="undoIndex === 0"
        @click="undo"
        aria-label="ย้อนการแก้ Mask"
      >
        <Undo2 :size="16" /></button
      ><button
        :disabled="undoIndex === undoCount - 1"
        @click="redo"
        aria-label="ทำซ้ำการแก้ Mask"
      >
        <Redo2 :size="16" /></button
      ><button @click="reset" title="กลับไปผล AI">
        <RotateCcw :size="16" />
      </button>
    </fieldset>
    <div class="mask-preview" :class="theme">
      <canvas
        ref="canvas"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @lostpointercapture="up"
      />
    </div>
    <div class="mask-options">
      <label class="check-label"
        ><input
          v-model="before"
          type="checkbox"
          :disabled="disabled"
          @change="draw"
        />ดูภาพ Crop ต้นฉบับ</label
      ><select v-model="theme" aria-label="พื้นหลังพรีวิว">
        <option value="checker">ตารางโปร่งใส</option>
        <option value="light">พื้นสว่าง</option>
        <option value="dark">พื้นมืด</option></select
      ><span>{{ width }} × {{ height }} px</span>
    </div>
    <p class="small-note">
      Restore คืนพิกเซลจาก Crop ต้นฉบับ · พื้นหลังพรีวิวไม่ติดไปใน PNG
    </p>
  </div>
</template>
