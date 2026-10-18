import { describe, it, expect } from "vitest";
import { composeBackground } from "../src/lib/ai-composition";
import { blank } from "../src/lib/editor";
describe("AI background composition", () => {
  it("preserves all editable layers when choosing only background", () => {
    const doc = blank();
    doc.elements = [
      {
        id: "title",
        type: "text",
        text: "ภาษาไทย",
        x: 1,
        y: 2,
        width: 100,
        height: 100,
      },
    ];
    const next = composeBackground(doc, "ai-bg", 0);
    expect(next.elements).toEqual(doc.elements);
    expect(next.backgroundAssetId).toBe("ai-bg");
    expect(doc.backgroundAssetId).toBeUndefined();
  });
  it("keeps real character asset and logo, lays out opposite sides in variants", () => {
    const doc = blank();
    doc.elements = [
      {
        id: "character",
        type: "image",
        assetId: "real-raora",
        x: 0,
        y: 0,
        width: 300,
        height: 500,
      },
      {
        id: "logo",
        type: "image",
        assetId: "logo-file",
        x: 1100,
        y: 20,
        width: 80,
        height: 80,
      },
    ];
    const options = {
      characterId: "character",
      headline: "กรี๊ดลั่น!!",
      style: "horror",
    };
    const a = composeBackground(doc, "bg1", 0, options),
      b = composeBackground(doc, "bg2", 1, options);
    expect(a.elements[0].assetId).toBe("real-raora");
    expect(a.elements[0].x).toBeGreaterThan(b.elements[0].x);
    expect(a.elements[1]).toEqual(doc.elements[1]);
    expect(a.elements[2].text).toBe("กรี๊ดลั่น!!");
    expect(doc.elements).toHaveLength(2);
  });
  it("does not exceed the backend 100-layer limit", () => {
    const doc = blank();
    doc.elements = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      type: "image",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }));
    expect(() =>
      composeBackground(doc, "bg", 0, { headline: "ไทย", style: "cute" }),
    ).toThrow("100");
  });
});
