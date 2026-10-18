import { markRaw } from "vue";
import type { ApiClient } from "../services/api";
export class ImageCache {
  private entries = new Map<
    string,
    Promise<{ image: HTMLImageElement; url: string }>
  >();
  private urls = new Set<string>();
  private disposed = false;
  constructor(private api: ApiClient) {}
  load(id: string) {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = (async () => {
        const blob = await this.api.blob(id);
        if (this.disposed) throw new Error("Image cache closed");
        const url = URL.createObjectURL(blob);
        this.urls.add(url);
        const image = new Image();
        image.src = url;
        try {
          await image.decode();
        } catch {
          URL.revokeObjectURL(url);
          this.urls.delete(url);
          throw new Error("อ่านไฟล์ภาพไม่สำเร็จ");
        }
        if (this.disposed) throw new Error("Image cache closed");
        return { image: markRaw(image), url };
      })();
      this.entries.set(id, entry);
      entry.catch(() => this.entries.delete(id));
    }
    return entry;
  }
  dispose() {
    this.disposed = true;
    this.urls.forEach(URL.revokeObjectURL);
    this.urls.clear();
    this.entries.clear();
  }
}
