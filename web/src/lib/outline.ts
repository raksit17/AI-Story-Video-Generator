// Square max-filter in linear time; fills an outline around the alpha silhouette.
export function dilateAlpha(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.round(radius)),
    temp = new Uint8ClampedArray(input.length),
    out = new Uint8ClampedArray(input.length);
  function pass(
    source: Uint8ClampedArray,
    target: Uint8ClampedArray,
    lines: number,
    length: number,
    vertical: boolean,
  ) {
    const queue = new Int32Array(length),
      at = (line: number, i: number) =>
        vertical ? i * width + line : line * width + i;
    for (let line = 0; line < lines; line++) {
      let head = 0,
        tail = 0,
        added = -1;
      for (let i = 0; i < length; i++) {
        const end = Math.min(length - 1, i + r);
        while (added < end) {
          added++;
          while (
            tail > head &&
            source[at(line, queue[tail - 1])] <= source[at(line, added)]
          )
            tail--;
          queue[tail++] = added;
        }
        while (tail > head && queue[head] < i - r) head++;
        target[at(line, i)] = source[at(line, queue[head])];
      }
    }
  }
  pass(input, temp, height, width, false);
  pass(temp, out, width, height, true);
  return out;
}
const cache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
export function outlinedImage(
  image: HTMLImageElement,
  radius: number,
  color: string,
) {
  const r = Math.max(0, Math.min(30, Math.round(radius))),
    key = `${r}:${color}`;
  let entries = cache.get(image);
  if (!entries) {
    entries = new Map();
    cache.set(image, entries);
  }
  const found = entries.get(key);
  if (found) return { canvas: found, pad: r };
  const width = image.naturalWidth + 2 * r,
    height = image.naturalHeight + 2 * r,
    c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, r, r);
  const pixels = ctx.getImageData(0, 0, width, height),
    alpha = Uint8ClampedArray.from(
      { length: width * height },
      (_, i) => pixels.data[i * 4 + 3],
    ),
    expanded = dilateAlpha(alpha, width, height, r);
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < expanded.length; i++) {
    pixels.data[i * 4] = rgb[0];
    pixels.data[i * 4 + 1] = rgb[1];
    pixels.data[i * 4 + 2] = rgb[2];
    pixels.data[i * 4 + 3] = expanded[i];
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.drawImage(image, r, r);
  if (entries.size >= 3) entries.delete(entries.keys().next().value!);
  entries.set(key, c);
  return { canvas: c, pad: r };
}
