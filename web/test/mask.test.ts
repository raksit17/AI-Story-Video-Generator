import { describe, it, expect } from "vitest";
import { paintAlpha, applyAlpha, alphaChannel } from "../src/lib/mask";
import { dilateAlpha } from "../src/lib/outline";
describe("Character pixel editing", () => {
  it("erases and restores original alpha, including original transparency", () => {
    const original = new Uint8ClampedArray(25).fill(180),
      alpha = original.slice();
    original[0] = 0;
    paintAlpha(alpha, original, 5, 5, 2, 2, 2, "erase");
    expect(alpha[12]).toBe(0);
    expect(alpha[24]).toBe(180);
    paintAlpha(alpha, original, 5, 5, 2, 2, 2, "restore");
    expect(alpha[12]).toBe(180);
    paintAlpha(alpha, original, 5, 5, 0, 0, 2, "restore");
    expect(alpha[0]).toBe(0);
  });
  it("preserves original RGB when applying corrected alpha", () => {
    const rgba = new Uint8ClampedArray([120, 80, 40, 0]);
    const out = applyAlpha(rgba, new Uint8ClampedArray([255]));
    expect([...out]).toEqual([120, 80, 40, 255]);
    expect([...alphaChannel(out)]).toEqual([255]);
    expect(rgba[3]).toBe(0);
  });
  it("outline dilation matches a reference at edges and different radii", () => {
    const source = Uint8ClampedArray.from(
      { length: 35 },
      (_, i) => (i * 73) % 256,
    );
    for (const radius of [0, 1, 3, 10]) {
      const result = dilateAlpha(source, 7, 5, radius);
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 7; x++) {
          let max = 0;
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
              if (x + dx >= 0 && x + dx < 7 && y + dy >= 0 && y + dy < 5)
                max = Math.max(max, source[(y + dy) * 7 + x + dx]);
            }
          expect(result[y * 7 + x]).toBe(max);
        }
    }
  });
});
