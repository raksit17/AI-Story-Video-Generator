<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Konva from "konva";
import type { Element, ThumbnailDocument } from "../types";
import { background, shape, waitForFonts } from "../lib/scene";
const props = defineProps<{
  document: ThumbnailDocument;
  images: Record<string, HTMLImageElement>;
  selected: string | null;
  disabled: boolean;
}>();
const emit = defineEmits<{
  select: [id: string | null];
  patch: [id: string, patch: Partial<Element>];
  scale: [percent: number];
}>();
const host = ref<HTMLDivElement>();
const wrapper = ref<HTMLDivElement>();
let stage: Konva.Stage,
  layer: Konva.Layer,
  transformer: Konva.Transformer,
  observer: ResizeObserver;
let mounted = true;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
function attach() {
  if (!transformer) return;
  const node = layer.findOne((n: Konva.Node) => n.id() === props.selected);
  transformer.nodes(node && node.visible() && !props.disabled ? [node] : []);
  layer.batchDraw();
}
function render() {
  if (!stage) return;
  layer.destroyChildren();
  background(layer, props.document, props.images);
  for (const e of props.document.elements) {
    const node = shape(e, props.images);
    node.draggable(!props.disabled);
    node.on("click tap", () => emit("select", e.id));
    node.on("dragstart", () => emit("select", e.id));
    node.on("dragend", () =>
      emit("patch", e.id, {
        x: clamp(Math.round(node.x()), -5000, 5000),
        y: clamp(Math.round(node.y()), -5000, 5000),
      }),
    );
    node.on("transformend", () => {
      const sx = node.scaleX(),
        sy = node.scaleY();
      emit("patch", e.id, {
        x: clamp(Math.round(node.x()), -5000, 5000),
        y: clamp(Math.round(node.y()), -5000, 5000),
        width: clamp(Math.round(node.width() * sx), 1, 5000),
        height: clamp(Math.round(node.height() * sy), 1, 5000),
        rotation: Math.round(
          ((((node.rotation() + 180) % 360) + 360) % 360) - 180,
        ),
        ...(e.type === "text"
          ? { fontSize: clamp(Math.round((e.fontSize ?? 80) * sy), 8, 400) }
          : {}),
      });
    });
    layer.add(node);
  }
  transformer = new Konva.Transformer({
    rotateEnabled: true,
    flipEnabled: false,
    keepRatio: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    borderStroke: "#B7A6FF",
    anchorStroke: "#FFFFFF",
    anchorFill: "#9271F4",
    anchorSize: 10,
    anchorCornerRadius: 3,
    padding: 4,
    boundBoxFunc: (oldBox, newBox) =>
      Math.abs(newBox.width) < 16 || Math.abs(newBox.height) < 16
        ? oldBox
        : newBox,
  });
  layer.add(transformer);
  attach();
  layer.draw();
}
function resize() {
  if (!stage || !wrapper.value) return;
  const scale = Math.min(wrapper.value.clientWidth / 1280, 1);
  stage.size({ width: 1280 * scale, height: 720 * scale });
  stage.scale({ x: scale, y: scale });
  stage.draw();
  emit("scale", Math.round(scale * 100));
}
onMounted(async () => {
  stage = new Konva.Stage({ container: host.value!, width: 1280, height: 720 });
  layer = new Konva.Layer();
  stage.add(layer);
  stage.on("click tap", (event) => {
    if (event.target === stage) emit("select", null);
  });
  observer = new ResizeObserver(resize);
  observer.observe(wrapper.value!);
  render();
  resize();
  await waitForFonts(props.document);
  if (mounted) render();
});
watch(() => [props.document, props.images, props.disabled], render, {
  deep: true,
});
watch(() => props.selected, attach);
watch(
  () =>
    props.document.elements
      .map((e) => `${e.fontFamily}|${e.fontStyle}`)
      .join(","),
  async () => {
    await waitForFonts(props.document);
    if (mounted) render();
  },
);
onBeforeUnmount(() => {
  mounted = false;
  observer?.disconnect();
  stage?.destroy();
});
</script>
<template>
  <div
    ref="wrapper"
    class="canvas-wrap"
    role="region"
    aria-label="พื้นที่ออกแบบภาพปก 1280 คูณ 720"
  >
    <div ref="host" class="konva-host" />
  </div>
</template>
