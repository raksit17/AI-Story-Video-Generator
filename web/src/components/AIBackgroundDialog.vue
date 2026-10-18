<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import { X, Sparkles, LoaderCircle, RefreshCw } from "lucide-vue-next";
import type {
  AiInput,
  AiJob,
  AiStyle,
  Asset,
  ThumbnailDocument,
} from "../types";
import type { ApiClient } from "../services/api";
import { ImageCache } from "../lib/images";
import { exportScene } from "../lib/scene";
import { composeBackground } from "../lib/ai-composition";
const props = defineProps<{
  api: ApiClient;
  videoId: string;
  document: ThumbnailDocument;
  images: Record<string, HTMLImageElement>;
}>();
const emit = defineEmits<{
  close: [];
  apply: [document: ThumbnailDocument, assets: Asset[]];
}>();
const style = ref<AiStyle>("horror"),
  prompt = ref(
    "Dark haunted hospital corridor, eerie purple lighting, dramatic shadows",
  ),
  negative = ref(""),
  variations = ref(3),
  resolution = ref<"standard" | "low">("standard"),
  steps = ref(22),
  cfg = ref(6),
  seed = ref("");
const jobs = ref<AiJob[]>([]),
  selectedId = ref(""),
  busy = ref(""),
  error = ref(""),
  connection = ref(""),
  listError = ref(""),
  loading = ref(false);
const selected = computed(() =>
  jobs.value.find((j) => j.id === selectedId.value),
);
const characters = props.document.elements.filter((e) => e.type === "image");
const layout = ref(false),
  characterId = ref(characters[0]?.id ?? ""),
  headline = ref(
    props.document.elements.find((e) => e.type === "text")?.text ??
      "กรี๊ดลั่น!!",
  );
const cache = new ImageCache(props.api),
  previews = ref<
    { url: string; document: ThumbnailDocument; asset: Asset; seed: number }[]
  >([]);
let timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false,
  refreshing = false,
  previewRun = 0;
let pending: AiInput | undefined;
const presetPrompts: Record<AiStyle, string> = {
  horror:
    "Dark haunted hospital corridor, eerie purple lighting, dramatic shadows",
  funny:
    "Bright comic burst background, pink and yellow speed lines, playful gaming atmosphere",
  cute: "Pastel pink and lavender background, soft bokeh, floating decorative stars",
  epic: "Dramatic blue and orange energy background, cinematic rim light, powerful gaming atmosphere",
};
watch(style, (next, previous) => {
  if (prompt.value === presetPrompts[previous])
    prompt.value = presetPrompts[next];
});
const labels: Record<string, string> = {
  queued: "รอคิว",
  submitting: "กำลังส่งงาน",
  running: "กำลังสร้างภาพ",
  completed: "เสร็จแล้ว",
  failed: "ไม่สำเร็จ",
  cancelled: "หยุดแล้ว",
};
function clearPreviews() {
  previews.value.forEach((p) => URL.revokeObjectURL(p.url));
  previews.value = [];
}
async function refresh() {
  if (refreshing || disposed) return;
  refreshing = true;
  try {
    const response = await props.api.aiJobs(props.videoId);
    if (disposed) return;
    jobs.value = response.items;
    if (!selectedId.value && jobs.value.length)
      selectedId.value = jobs.value[0].id;
    listError.value = "";
  } catch (e) {
    if (!disposed) listError.value = message(e);
  } finally {
    refreshing = false;
  }
}
async function poll() {
  await refresh();
  if (!disposed) timer = setTimeout(poll, 2500);
}
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
async function health() {
  busy.value = "health";
  try {
    const h = await props.api.aiHealth(props.videoId);
    connection.value = h.checkpointAvailable
      ? `พร้อม · ${h.checkpoint} · ${h.idle ? "คิวว่าง" : "มีงานใน ComfyUI"}`
      : `ไม่พบ checkpoint ${h.checkpoint} ใน ComfyUI`;
    error.value = "";
  } catch (e) {
    connection.value = "ยังเชื่อมต่อ ComfyUI ไม่ได้";
    error.value = message(e);
  } finally {
    busy.value = "";
  }
}
async function generate() {
  busy.value = "generate";
  error.value = "";
  try {
    if (!pending) {
      const n = seed.value.trim() ? Number(seed.value) : undefined;
      if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 2147483644))
        throw new Error("Seed ต้องเป็นจำนวนเต็ม 0–2147483644");
      if (prompt.value.trim().length < 3)
        throw new Error("กรอก Prompt อย่างน้อย 3 ตัวอักษร");
      pending = {
        requestId: crypto.randomUUID(),
        style: style.value,
        prompt: prompt.value.trim(),
        negativePrompt: negative.value,
        variations: variations.value,
        resolution: resolution.value,
        steps: steps.value,
        cfg: cfg.value,
        ...(n === undefined ? {} : { seed: n }),
      };
    }
    const job = await props.api.generateBackground(props.videoId, pending);
    pending = undefined;
    selectedId.value = job.id;
    jobs.value = [job, ...jobs.value.filter((j) => j.id !== job.id)];
    await refresh();
  } catch (e) {
    error.value =
      message(e) +
      " · หากการตอบกลับขาดหาย กดส่งซ้ำจะใช้ requestId เดิมเพื่อไม่สร้างงานซ้ำ";
  } finally {
    busy.value = "";
  }
}
function changed() {
  pending = undefined;
}
async function cancel() {
  if (!selected.value) return;
  busy.value = "cancel";
  try {
    await props.api.cancelAiJob(props.videoId, selected.value.id);
    await refresh();
  } catch (e) {
    error.value = message(e);
  } finally {
    busy.value = "";
  }
}
async function renderPreviews() {
  const run = ++previewRun;
  const job = selected.value;
  clearPreviews();
  if (!job?.state.assets.length) {
    loading.value = false;
    return;
  }
  loading.value = true;
  const results: typeof previews.value = [];
  try {
    const imageMap = { ...props.images };
    for (let i = 0; i < job.state.assets.length; i++) {
      const asset = job.state.assets[i];
      imageMap[asset.id] = (await cache.load(asset.id)).image;
      if (disposed || run !== previewRun) break;
      const doc = composeBackground(
        toRaw(props.document),
        asset.id,
        i,
        layout.value
          ? {
              characterId: characterId.value,
              headline: headline.value,
              style: job.input.style,
            }
          : undefined,
      );
      const blob = await exportScene(doc, imageMap, "jpeg");
      results.push({
        url: URL.createObjectURL(blob),
        document: doc,
        asset,
        seed: job.state.seeds[i],
      });
    }
    if (disposed || run !== previewRun) {
      results.forEach((p) => URL.revokeObjectURL(p.url));
      return;
    }
    previews.value = results;
  } catch (e) {
    results.forEach((p) => URL.revokeObjectURL(p.url));
    if (!disposed && run === previewRun)
      error.value = "สร้างพรีวิวไม่ได้: " + message(e);
  } finally {
    if (run === previewRun) loading.value = false;
  }
}
watch(
  () =>
    `${selectedId.value}:${selected.value?.state.assets.map((a) => a.id).join(",")}`,
  renderPreviews,
);
watch([layout, characterId], renderPreviews);
onMounted(() => {
  void poll();
});
onBeforeUnmount(() => {
  disposed = true;
  previewRun++;
  if (timer) clearTimeout(timer);
  cache.dispose();
  clearPreviews();
});
</script>
<template>
  <div class="modal-backdrop removal-backdrop">
    <section
      class="removal-dialog ai-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-title"
    >
      <div class="section-heading">
        <div>
          <span class="eyebrow">PHASE 03 · AI BACKGROUND</span>
          <h2 id="ai-title">
            <Sparkles :size="21" />สร้างฉากใหม่ให้โมเมนต์เดิม
          </h2>
        </div>
        <button
          class="icon-button"
          aria-label="ปิด AI Generator"
          @click="emit('close')"
        >
          <X />
        </button>
      </div>
      <p class="small-note">
        AI สร้างเฉพาะพื้นหลัง · ตัวละครและข้อความของคุณยังเป็น Layer ที่แก้ไขได้
        · ปิดหน้าต่างนี้แล้วงานยังทำต่อ
      </p>
      <div v-if="error || listError" class="alert error" role="alert">
        {{ error || listError }}
      </div>
      <div class="ai-grid">
        <div class="ai-controls">
          <fieldset
            :disabled="!!busy"
            class="ai-fields"
            @input="changed"
            @change="changed"
          >
            <label
              >สไตล์<select v-model="style">
                <option value="horror">Horror · สยองขวัญ</option>
                <option value="funny">Funny · สีสันและมุก</option>
                <option value="cute">Cute · พาสเทลน่ารัก</option>
                <option value="epic">Epic · แสงเข้มข้น</option>
              </select></label
            >
            <label
              >Prompt (แนะนำภาษาอังกฤษ)<textarea
                v-model="prompt"
                rows="4"
                maxlength="1500"
              />
            </label>
            <label
              >Negative prompt เพิ่มเติม<input
                v-model="negative"
                maxlength="1000"
                placeholder="สิ่งที่ไม่ต้องการในภาพ"
            /></label>
            <div class="crop-fields">
              <label
                >จำนวนภาพ<select v-model.number="variations">
                  <option :value="1">1 ภาพ</option>
                  <option :value="2">2 ภาพ</option>
                  <option :value="3">3 ภาพ</option>
                </select></label
              ><label
                >ขนาด<select v-model="resolution">
                  <option value="standard">1024 × 576</option>
                  <option value="low">768 × 448</option>
                </select></label
              >
            </div>
            <details>
              <summary>ตั้งค่าเพิ่มเติม</summary>
              <div class="crop-fields">
                <label
                  >Steps<input
                    type="number"
                    v-model.number="steps"
                    min="10"
                    max="30" /></label
                ><label
                  >CFG<input
                    type="number"
                    v-model.number="cfg"
                    min="1"
                    max="10"
                    step="0.5"
                /></label>
              </div>
              <label
                >Seed<input
                  v-model="seed"
                  inputmode="numeric"
                  placeholder="เว้นว่างเพื่อสุ่ม"
              /></label>
            </details>
          </fieldset>
          <button class="button purple" :disabled="!!busy" @click="generate">
            <LoaderCircle
              v-if="busy === 'generate'"
              class="spin"
              :size="17"
            /><Sparkles v-else :size="17" />สร้างพื้นหลัง
          </button>
          <button class="button ghost" :disabled="!!busy" @click="health">
            ตรวจ ComfyUI
          </button>
          <p class="small-note">
            {{ connection || "รัน ComfyUI ในเครื่องที่พอร์ต 8188" }}
          </p>
        </div>
        <div class="ai-results">
          <div class="section-heading">
            <h3>งานและผลลัพธ์</h3>
            <button
              class="icon-button"
              aria-label="รีเฟรชงาน AI"
              @click="refresh"
            >
              <RefreshCw :size="16" />
            </button>
          </div>
          <select v-model="selectedId" aria-label="เลือกงาน AI">
            <option v-if="!jobs.length" value="">ยังไม่มีงาน</option>
            <option v-for="job in jobs" :key="job.id" :value="job.id">
              {{ labels[job.status] }} · {{ job.input.style }} ·
              {{ new Date(job.createdAt).toLocaleTimeString("th-TH") }} ·
              {{ job.input.prompt.slice(0, 40) }}
            </option>
          </select>
          <template v-if="selected"
            ><div class="ai-status">
              <strong
                >{{ labels[selected.status] }} ·
                {{ selected.state.assets.length }} /
                {{ selected.input.variations }} ภาพ</strong
              ><progress
                :value="selected.state.assets.length"
                :max="selected.input.variations"
              />
              <p class="small-note">
                {{ selected.state.error || selected.state.message }}
              </p>
              <small
                >ความคืบหน้าแสดงจำนวนภาพที่บันทึกแล้ว ไม่ใช่เปอร์เซ็นต์
                Sampling</small
              ><button
                v-if="
                  ['queued', 'running', 'submitting'].includes(selected.status)
                "
                class="button ghost"
                :disabled="!!busy || selected.cancelRequested"
                @click="cancel"
              >
                {{
                  selected.cancelRequested
                    ? "รอภาพปัจจุบันจบ…"
                    : "หยุดหลังภาพปัจจุบัน"
                }}
              </button>
            </div></template
          >
          <div class="ai-layout">
            <label class="check-label"
              ><input
                type="checkbox"
                v-model="layout"
              />จัดตำแหน่งตัวละครและหัวเรื่องอัตโนมัติ</label
            ><template v-if="layout"
              ><label
                >ตัวละครจาก Layer ปัจจุบัน<select v-model="characterId">
                  <option value="">ไม่จัดตัวละคร</option>
                  <option v-for="e in characters" :key="e.id" :value="e.id">
                    {{ e.id.slice(0, 8) }} · PNG/Image layer
                  </option>
                </select></label
              ><label
                >หัวเรื่องไทย<textarea
                  v-model="headline"
                  rows="2"
                  maxlength="120"
                  @change="renderPreviews"
                />
              </label>
              <p class="small-note">
                ปรับตัวละครที่เลือกและข้อความชั้นแรก; Layer อื่นคงอยู่
              </p></template
            >
          </div>
          <p v-if="loading" class="small-note">กำลังประกอบพรีวิวภาพปก…</p>
          <div class="ai-gallery">
            <article v-for="(item, i) in previews" :key="item.asset.id">
              <img :src="item.url" :alt="`ภาพปกตัวเลือก ${i + 1}`" />
              <div>
                <span>แบบ {{ i + 1 }} · Seed {{ item.seed }}</span
                ><button
                  class="button purple"
                  :disabled="!!busy || loading"
                  @click="
                    emit('apply', item.document, selected?.state.assets ?? [])
                  "
                >
                  ใช้แบบนี้ใน Editor
                </button>
              </div>
            </article>
          </div>
          <p v-if="!previews.length && !loading" class="small-note">
            ผลลัพธ์จะแสดงทีละภาพเมื่อสร้างเสร็จ เพิ่ม PNG ตัวละครและข้อความใน
            Editor ก่อนเปิดหน้านี้เพื่อดูภาพปกครบองค์ประกอบ
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
