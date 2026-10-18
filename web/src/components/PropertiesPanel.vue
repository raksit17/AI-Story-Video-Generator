<script setup lang="ts">
import {
  SlidersHorizontal,
  Type,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-vue-next";
import type { Element } from "../types";
const props = defineProps<{ element: Element | null; disabled: boolean }>();
const emit = defineEmits<{ patch: [patch: Partial<Element>] }>();
function value(event: Event) {
  return (event.target as HTMLInputElement).value;
}
function number(key: keyof Element, event: Event, min: number, max: number) {
  const n = Number(value(event));
  if (Number.isFinite(n))
    emit("patch", {
      [key]:
        key === "fontSize"
          ? Math.round(Math.max(min, Math.min(max, n)))
          : Math.round(Math.max(min, Math.min(max, n)) * 100) / 100,
    });
}
</script>
<template>
  <section class="properties-panel">
    <div class="section-heading">
      <h2><SlidersHorizontal :size="15" /> ปรับแต่ง</h2>
      <span class="micro">PROPERTIES</span>
    </div>
    <div v-if="!element" class="empty-properties">
      <div class="empty-symbol"><SlidersHorizontal :size="24" /></div>
      <h3>ให้ทุกจุดเป็นคุณ</h3>
      <p>เลือกข้อความหรือรูปบนภาพปก<br />เพื่อปรับขนาด สี และองค์ประกอบ</p>
      <span class="key-hint">คลิก Layer เพื่อเริ่มแก้ไข</span>
    </div>
    <fieldset v-else :disabled="disabled" class="property-fields">
      <div class="selected-kind">
        <component
          :is="element.type === 'text' ? Type : Image"
          :size="16"
        /><span>{{ element.type === "text" ? "ข้อความ" : "รูปภาพ" }}</span
        ><small>กำลังเลือก</small>
      </div>
      <template v-if="element.type === 'text'">
        <label
          >ข้อความ<textarea
            :value="element.text"
            maxlength="2000"
            rows="3"
            @change="emit('patch', { text: value($event) })"
            aria-label="ข้อความบนภาพปก"
          />
        </label>
        <label
          >ฟอนต์<select
            :value="element.fontFamily"
            @change="emit('patch', { fontFamily: value($event) })"
          >
            <option>Noto Sans Thai</option>
            <option>Inter Variable</option>
          </select></label
        >
        <div class="field-grid">
          <label
            >ขนาด<input
              type="number"
              :value="element.fontSize"
              min="8"
              max="400"
              @change="number('fontSize', $event, 8, 400)" /></label
          ><label
            >น้ำหนัก<select
              :value="element.fontStyle"
              @change="
                emit('patch', {
                  fontStyle: value($event) as Element['fontStyle'],
                })
              "
            >
              <option value="normal">ปกติ</option>
              <option value="bold">ตัวหนา</option>
              <option value="italic">ตัวเอียง</option>
              <option value="bold italic">หนาเอียง</option>
            </select></label
          >
        </div>
        <div class="alignment">
          <button
            v-for="item in [
              { v: 'left', icon: AlignLeft },
              { v: 'center', icon: AlignCenter },
              { v: 'right', icon: AlignRight },
            ]"
            :key="item.v"
            :class="{ active: (element.align || 'left') === item.v }"
            :aria-label="`จัดข้อความ ${item.v}`"
            @click="emit('patch', { align: item.v as Element['align'] })"
          >
            <component :is="item.icon" :size="17" />
          </button>
        </div>
        <div class="field-grid">
          <label
            >สีข้อความ
            <div class="color-field">
              <input
                type="color"
                :value="element.fill || '#FFFFFF'"
                @input="emit('patch', { fill: value($event) })"
              /><span>{{ element.fill }}</span>
            </div></label
          ><label
            >สีเส้นขอบ
            <div class="color-field">
              <input
                type="color"
                :value="element.stroke || '#000000'"
                @input="emit('patch', { stroke: value($event) })"
              /><span>{{ element.stroke }}</span>
            </div></label
          >
        </div>
        <label
          >เส้นขอบ
          <span class="label-value">{{ element.strokeWidth || 0 }} px</span
          ><input
            type="range"
            min="0"
            max="30"
            :value="element.strokeWidth || 0"
            @change="number('strokeWidth', $event, 0, 30)"
        /></label>
        <details open>
          <summary>เงาข้อความ</summary>
          <div class="field-grid">
            <label
              >สีเงา<input
                type="color"
                :value="element.shadowColor || '#000000'"
                @input="emit('patch', { shadowColor: value($event) })" /></label
            ><label
              >ความฟุ้ง<input
                type="number"
                min="0"
                max="100"
                :value="element.shadowBlur || 0"
                @change="number('shadowBlur', $event, 0, 100)" /></label
            ><label
              >ระยะ X<input
                type="number"
                min="-100"
                max="100"
                :value="element.shadowOffsetX || 0"
                @change="number('shadowOffsetX', $event, -100, 100)" /></label
            ><label
              >ระยะ Y<input
                type="number"
                min="-100"
                max="100"
                :value="element.shadowOffsetY || 0"
                @change="number('shadowOffsetY', $event, -100, 100)"
            /></label>
          </div>
        </details>
      </template>
      <template v-if="element.type === 'image'">
        <h2>ขอบตัวละครและเงา</h2>
        <div class="field-grid">
          <label
            >สีเส้นขอบ<input
              type="color"
              :value="element.stroke || '#FFFFFF'"
              @input="emit('patch', { stroke: value($event) })" /></label
          ><label
            >ขนาดขอบ (px ต้นฉบับ)<input
              type="number"
              min="0"
              max="30"
              :value="element.strokeWidth || 0"
              @change="number('strokeWidth', $event, 0, 30)"
          /></label>
        </div>
        <div class="field-grid">
          <label
            >สีเงา<input
              type="color"
              :value="element.shadowColor || '#000000'"
              @input="emit('patch', { shadowColor: value($event) })" /></label
          ><label
            >ความฟุ้ง<input
              type="number"
              min="0"
              max="100"
              :value="element.shadowBlur || 0"
              @change="number('shadowBlur', $event, 0, 100)" /></label
          ><label
            >เงา X<input
              type="number"
              min="-100"
              max="100"
              :value="element.shadowOffsetX || 0"
              @change="number('shadowOffsetX', $event, -100, 100)" /></label
          ><label
            >เงา Y<input
              type="number"
              min="-100"
              max="100"
              :value="element.shadowOffsetY || 0"
              @change="number('shadowOffsetY', $event, -100, 100)"
          /></label>
        </div>
      </template>
      <details open>
        <summary>ตำแหน่งและขนาด</summary>
        <div class="field-grid">
          <label
            >X<input
              type="number"
              :value="element.x"
              min="-5000"
              max="5000"
              @change="number('x', $event, -5000, 5000)" /></label
          ><label
            >Y<input
              type="number"
              :value="element.y"
              min="-5000"
              max="5000"
              @change="number('y', $event, -5000, 5000)" /></label
          ><label
            >กว้าง<input
              type="number"
              :value="element.width"
              min="1"
              max="5000"
              @change="number('width', $event, 1, 5000)" /></label
          ><label
            >สูง<input
              type="number"
              :value="element.height"
              min="1"
              max="5000"
              @change="number('height', $event, 1, 5000)"
          /></label>
        </div>
      </details>
      <div class="field-grid">
        <label
          >หมุน °<input
            type="number"
            :value="element.rotation || 0"
            min="-360"
            max="360"
            @change="number('rotation', $event, -360, 360)" /></label
        ><label
          >ความทึบ<input
            type="number"
            :value="element.opacity ?? 1"
            min="0"
            max="1"
            step="0.05"
            @change="number('opacity', $event, 0, 1)"
        /></label>
      </div>
    </fieldset>
  </section>
</template>
