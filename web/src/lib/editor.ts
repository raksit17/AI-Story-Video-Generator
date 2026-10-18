import type { ThumbnailDocument, Element } from "../types";
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const blank = (): ThumbnailDocument => ({
  version: 1,
  width: 1280,
  height: 720,
  backgroundColor: "#14161E",
  elements: [],
});
export function textElement(): Element {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "กรี๊ดลั่น!!",
    x: 80,
    y: 460,
    width: 1120,
    height: 180,
    fontFamily: "Noto Sans Thai",
    fontSize: 100,
    fontStyle: "bold",
    fill: "#FFD75E",
    stroke: "#17141D",
    strokeWidth: 8,
    shadowColor: "#000000",
    shadowBlur: 12,
    shadowOffsetX: 4,
    shadowOffsetY: 6,
    align: "left",
    rotation: 0,
    opacity: 1,
    visible: true,
  };
}
export function parseTimes(input: string): number[] {
  const tokens = input.split(",").map((t) => t.trim());
  if (!tokens.length || tokens.length > 12 || tokens.some((t) => !t))
    throw new Error("ใส่เวลา 1–12 จุด คั่นด้วยเครื่องหมาย comma");
  return [
    ...new Set(
      tokens.map((token) => {
        if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(token))
          throw new Error(`รูปแบบเวลาไม่ถูกต้อง: ${token}`);
        const parts = token.split(":").map(Number);
        if (parts.length > 1 && parts.slice(1).some((n) => n >= 60))
          throw new Error("นาที/วินาทีหลัง : ต้องน้อยกว่า 60");
        const ms = Math.round(parts.reduce((acc, n) => acc * 60 + n, 0) * 1000);
        if (ms > 2147483647) throw new Error("เวลาเกินขอบเขตที่รองรับ");
        return ms;
      }),
    ),
  ].sort((a, b) => a - b);
}
export function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000),
    h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
export function moveLayer(doc: ThumbnailDocument, id: string, delta: number) {
  const next = clone(doc),
    index = next.elements.findIndex((e) => e.id === id),
    target = index + delta;
  if (index >= 0 && target >= 0 && target < next.elements.length)
    [next.elements[index], next.elements[target]] = [
      next.elements[target]!,
      next.elements[index]!,
    ];
  return next;
}
export function assetIds(doc: ThumbnailDocument) {
  return [
    ...new Set(
      [
        doc.backgroundAssetId,
        ...doc.elements.filter((e) => e.type === "image").map((e) => e.assetId),
      ].filter((x): x is string => !!x),
    ),
  ];
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function safeFilename(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim()
      .slice(0, 100) || "thumbnail"
  );
}
