export function paintAlpha(
  alpha: Uint8ClampedArray,
  original: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  mode: "erase" | "restore",
) {
  const x0 = Math.max(0, Math.floor(x - radius)),
    x1 = Math.min(width - 1, Math.ceil(x + radius));
  const y0 = Math.max(0, Math.floor(y - radius)),
    y1 = Math.min(height - 1, Math.ceil(y + radius));
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const distance = Math.hypot(px - x, py - y);
      if (distance > radius) continue;
      const strength = Math.min(1, (1 - distance / radius) * 5),
        i = py * width + px;
      alpha[i] =
        mode === "erase"
          ? Math.round(alpha[i] * (1 - strength))
          : Math.round(alpha[i] + (original[i] - alpha[i]) * strength);
    }
}
export function applyAlpha(rgba: Uint8ClampedArray, alpha: Uint8ClampedArray) {
  const result = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) result[i * 4 + 3] = alpha[i];
  return result;
}
export function alphaChannel(rgba: Uint8ClampedArray) {
  return Uint8ClampedArray.from(
    { length: rgba.length / 4 },
    (_, i) => rgba[i * 4 + 3],
  );
}
