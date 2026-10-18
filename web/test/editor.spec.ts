import { describe, expect, it } from "vitest";
import {
  assetIds,
  blank,
  moveLayer,
  parseTimes,
  safeFilename,
} from "../src/lib/editor";
describe("editor document contract", () => {
  it("converts seconds and source mm:ss/hh:mm:ss to integer milliseconds", () => {
    expect(parseTimes("12, 00:18, 0:24.125, 01:02:03, 12")).toEqual([
      12000, 18000, 24125, 3723000,
    ]);
    expect(parseTimes("10:18")).toEqual([618000]);
  });
  it.each([
    "",
    "12,",
    "-1",
    "1:60",
    "1:12:90",
    "hello",
    "1.1234",
    Array(13).fill("1").join(","),
    "9999999999999",
  ])("rejects invalid timestamps %s", (s) =>
    expect(() => parseTimes(s)).toThrow(),
  );
  it("reorders by bottom-to-top array order without mutating history", () => {
    const doc = blank();
    doc.elements = [
      {
        id: "bottom",
        type: "image",
        assetId: "image",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      {
        id: "top",
        type: "text",
        text: "กรี๊ด",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ];
    const next = moveLayer(doc, "bottom", 1);
    expect(next.elements.map((e) => e.id)).toEqual(["top", "bottom"]);
    expect(doc.elements[0].id).toBe("bottom");
    expect(moveLayer(next, "bottom", 1)).toEqual(next);
  });
  it("loads each required asset once and sanitizes Windows filenames", () => {
    const doc = blank();
    doc.backgroundAssetId = "one";
    doc.elements = [
      {
        id: "a",
        type: "image",
        assetId: "one",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      {
        id: "b",
        type: "image",
        assetId: "two",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ];
    expect(assetIds(doc)).toEqual(["one", "two"]);
    expect(safeFilename("Raora: กรี๊ด!?/")).toBe("Raora กรี๊ด!");
  });
});
