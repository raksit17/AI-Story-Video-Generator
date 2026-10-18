<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import Konva from "konva";
import type { Crop } from "../types";
const props = defineProps<{
  image: HTMLImageElement;
  crop: Crop;
  disabled: boolean;
}>();
const emit = defineEmits<{ change: [crop: Crop] }>();
const host = ref<HTMLDivElement>(),
  wrap = ref<HTMLDivElement>();
let stage: Konva.Stage,
  layer: Konva.Layer,
  rect: Konva.Rect,
  transform: Konva.Transformer,
  observer: ResizeObserver;
let start: { x: number; y: number } | null = null;
const bound = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function fit() {
  if (!stage || !wrap.value) return;
  const scale = Math.min(
    wrap.value.clientWidth / props.image.naturalWidth,
    420 / props.image.naturalHeight,
    1,
  );
  stage.size({
    width: props.image.naturalWidth * scale,
    height: props.image.naturalHeight * scale,
  });
  stage.scale({ x: scale, y: scale });
  stage.draw();
}
function point() {
  const p = stage.getPointerPosition()!;
  return {
    x: bound(p.x / stage.scaleX(), 0, props.image.naturalWidth),
    y: bound(p.y / stage.scaleY(), 0, props.image.naturalHeight),
  };
}
function emitRect() {
  const width = bound(
    Math.round(rect.width() * rect.scaleX()),
    8,
    Math.min(2048, props.image.naturalWidth),
  );
  const height = bound(
    Math.round(rect.height() * rect.scaleY()),
    8,
    Math.min(2048, props.image.naturalHeight),
  );
  const crop = {
    x: bound(Math.round(rect.x()), 0, props.image.naturalWidth - width),
    y: bound(Math.round(rect.y()), 0, props.image.naturalHeight - height),
    width,
    height,
  };
  rect.scale({ x: 1, y: 1 });
  rect.setAttrs(crop);
  emit("change", crop);
  transform.forceUpdate();
  layer.draw();
}
onMounted(() => {
  stage = new Konva.Stage({ container: host.value!, width: 1, height: 1 });
  layer = new Konva.Layer();
  stage.add(layer);
  const source = new Konva.Image({
    image: props.image,
    width: props.image.naturalWidth,
    height: props.image.naturalHeight,
  });
  layer.add(source);
  rect = new Konva.Rect({
    ...props.crop,
    stroke: "#CBB4FF",
    strokeWidth: 2,
    strokeScaleEnabled: false,
    fill: "#A080FF16",
    draggable: !props.disabled,
  });
  layer.add(rect);
  transform = new Konva.Transformer({
    nodes: [rect],
    rotateEnabled: false,
    flipEnabled: false,
    keepRatio: false,
    anchorSize: 10,
    borderStroke: "#BA9BFF",
    anchorFill: "#BA9BFF",
    anchorStroke: "#FFFFFF",
  });
  layer.add(transform);
  rect.on("dragend transformend", emitRect);
  stage.on("mousedown touchstart", (event) => {
    if (props.disabled || (event.target !== source && event.target !== stage))
      return;
    start = point();
    rect.setAttrs({
      x: start.x,
      y: start.y,
      width: 1,
      height: 1,
      scaleX: 1,
      scaleY: 1,
    });
    transform.nodes([]);
  });
  stage.on("mousemove touchmove", () => {
    if (!start) return;
    const p = point();
    rect.setAttrs({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.min(2048, Math.abs(p.x - start.x)),
      height: Math.min(2048, Math.abs(p.y - start.y)),
    });
    layer.batchDraw();
  });
  stage.on("mouseup touchend mouseleave", () => {
    if (!start) return;
    start = null;
    emitRect();
    transform.nodes([rect]);
  });
  observer = new ResizeObserver(fit);
  observer.observe(wrap.value!);
  fit();
});
watch(
  () => props.crop,
  (crop) => {
    if (rect) {
      rect.setAttrs({ ...crop, scaleX: 1, scaleY: 1 });
      transform.forceUpdate();
      layer.draw();
    }
  },
  { deep: true },
);
watch(
  () => props.disabled,
  (value) => {
    rect?.draggable(!value);
    transform?.nodes(value ? [] : [rect]);
  },
);
onBeforeUnmount(() => {
  observer?.disconnect();
  stage?.destroy();
});
</script>
<template>
  <div ref="wrap" class="crop-canvas"><div ref="host" /></div>
</template>
