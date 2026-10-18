import type { ThumbnailDocument } from "../types";
export function composeBackground(
  document: ThumbnailDocument,
  backgroundAssetId: string,
  variant: number,
  options?: { characterId?: string; headline: string; style: string },
) {
  const result = structuredClone(document);
  result.backgroundAssetId = backgroundAssetId;
  if (!options) return result;
  const colors: Record<string, string> = {
    horror: "#FFD83D",
    funny: "#FFED49",
    cute: "#FFB7E0",
    epic: "#FFFFFF",
  };
  const character = result.elements.find(
    (e) => e.id === options.characterId && e.type === "image",
  );
  const right = variant % 2 === 0;
  if (character) {
    const aspect = character.width / character.height;
    character.height = 620;
    character.width = Math.min(760, 620 * aspect);
    character.height = character.width / aspect;
    character.x = right ? 1280 - character.width - 24 : 24;
    character.y = 720 - character.height;
    character.rotation = right ? -3 : 3;
    character.stroke = "#FFFFFF";
    character.strokeWidth = 4;
    character.shadowBlur = 14;
    character.shadowOffsetX = 3;
    character.shadowOffsetY = 6;
    character.visible = true;
  }
  if (options.headline.trim()) {
    let title = result.elements.find((e) => e.type === "text");
    if (!title) {
      if (result.elements.length >= 100)
        throw new Error("ไม่มีที่ว่างสำหรับข้อความ: สูงสุด 100 Layers");
      title = {
        id: crypto.randomUUID(),
        type: "text",
        x: 0,
        y: 0,
        width: 680,
        height: 300,
      };
      result.elements.push(title);
    }
    Object.assign(title, {
      text: options.headline.trim(),
      x: right ? 40 : 560,
      y: variant === 2 ? 70 : 390,
      width: 680,
      height: 280,
      fontSize: 84,
      fontFamily: "Noto Sans Thai",
      fontStyle: "bold",
      fill: colors[options.style] ?? "#FFFFFF",
      stroke: "#15101D",
      strokeWidth: 8,
      shadowColor: "#000000",
      shadowBlur: 10,
      shadowOffsetY: 5,
      rotation: right ? -3 : 3,
      visible: true,
    });
  }
  return result;
}
