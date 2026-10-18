import { outlinedImage } from "./outline";
import Konva from "konva";
import type { Element, ThumbnailDocument } from "../types";
export function shape(
  element: Element,
  images: Record<string, HTMLImageElement>,
): Konva.Shape {
  const common = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
    visible: element.visible !== false,
  };
  if (element.type === "image") {
    const image = images[element.assetId!];
    const node = new Konva.Image({
      ...common,
      image,
      shadowColor: element.shadowColor ?? "#000000",
      shadowBlur: element.shadowBlur ?? 0,
      shadowOffsetX: element.shadowOffsetX ?? 0,
      shadowOffsetY: element.shadowOffsetY ?? 0,
    });
    if (image && (element.strokeWidth ?? 0) > 0) {
      const { canvas, pad } = outlinedImage(
        image,
        element.strokeWidth!,
        element.stroke ?? "#FFFFFF",
      );
      node.sceneFunc((context, shape) => {
        const sx = shape.width() / image.naturalWidth,
          sy = shape.height() / image.naturalHeight;
        context.drawImage(
          canvas,
          -pad * sx,
          -pad * sy,
          canvas.width * sx,
          canvas.height * sy,
        );
      });
    }
    return node;
  }
  return new Konva.Text({
    ...common,
    text: element.text ?? "",
    fontFamily: element.fontFamily ?? "Noto Sans Thai",
    fontSize: element.fontSize ?? 80,
    fontStyle: element.fontStyle ?? "bold",
    fill: element.fill ?? "#FFFFFF",
    stroke: element.stroke ?? "#000000",
    strokeWidth: element.strokeWidth ?? 0,
    fillAfterStrokeEnabled: true,
    align: element.align ?? "left",
    shadowColor: element.shadowColor ?? "#000000",
    shadowBlur: element.shadowBlur ?? 0,
    shadowOffsetX: element.shadowOffsetX ?? 0,
    shadowOffsetY: element.shadowOffsetY ?? 0,
    shadowForStrokeEnabled: false,
    wrap: "word",
    lineHeight: 1.3,
  });
}
export function background(
  layer: Konva.Layer,
  doc: ThumbnailDocument,
  images: Record<string, HTMLImageElement>,
) {
  layer.add(
    new Konva.Rect({
      width: 1280,
      height: 720,
      fill: doc.backgroundColor,
      listening: false,
    }),
  );
  if (doc.backgroundAssetId && images[doc.backgroundAssetId])
    layer.add(
      new Konva.Image({
        image: images[doc.backgroundAssetId],
        width: 1280,
        height: 720,
        listening: false,
      }),
    );
}
export async function waitForFonts(doc: ThumbnailDocument) {
  for (const e of doc.elements.filter((e) => e.type === "text")) {
    const style = e.fontStyle ?? "bold";
    await document.fonts.load(
      `${style.includes("italic") ? "italic " : ""}${style.includes("bold") ? "700" : "400"} ${e.fontSize ?? 80}px "${e.fontFamily ?? "Noto Sans Thai"}"`,
      e.text || "กรี๊ด",
    );
  }
  await document.fonts.ready;
}
export async function exportScene(
  doc: ThumbnailDocument,
  images: Record<string, HTMLImageElement>,
  format: "png" | "jpeg",
) {
  await waitForFonts(doc);
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1280px;height:720px;";
  document.body.append(container);
  const stage = new Konva.Stage({ container, width: 1280, height: 720 });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    background(layer, doc, images);
    doc.elements.forEach((e) => layer.add(shape(e, images)));
    layer.draw();
    const blob = await stage.toBlob({
      mimeType: `image/${format}`,
      quality: 0.95,
      pixelRatio: 1,
    });
    if (!blob) throw new Error("สร้างไฟล์ภาพไม่สำเร็จ");
    return blob;
  } finally {
    stage.destroy();
    container.remove();
  }
}
