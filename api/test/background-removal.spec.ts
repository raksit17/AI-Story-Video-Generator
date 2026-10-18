import "reflect-metadata";
import sharp from "sharp";
import { BackgroundRemovalService } from "../src/thumbnails/background-removal.service";
describe("Background removal boundary and persistence", () => {
  let assets: any,
    service: BackgroundRemovalService,
    fetchMock: jest.SpyInstance;
  const dto = {
    sourceAssetId: "source",
    crop: { x: 4, y: 6, width: 16, height: 20 },
  };
  beforeEach(async () => {
    process.env.REMOVAL_WORKER_KEY = "worker-secret";
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    assets = {
      file: jest.fn().mockResolvedValue({
        asset: { videoId: "video", kind: "frame" },
        bytes,
      }),
      upload: jest
        .fn()
        .mockResolvedValueOnce({ id: "crop" })
        .mockResolvedValueOnce({ id: "cutout" }),
      deleteGenerated: jest.fn().mockResolvedValue(undefined),
    };
    service = new BackgroundRemovalService(assets);
    fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, options) => {
        expect((options!.headers as any)["X-Worker-Key"]).toBe("worker-secret");
        const file = (options!.body as FormData).get("file") as Blob;
        const crop = Buffer.from(await file.arrayBuffer());
        const meta = await sharp(crop).metadata();
        expect([meta.width, meta.height]).toEqual([16, 20]);
        return new Response(
          new Uint8Array(await sharp(crop).ensureAlpha().png().toBuffer()),
          { headers: { "content-type": "image/png" } },
        );
      });
  });
  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.REMOVAL_WORKER_KEY;
  });
  it("crops on server and stores original plus RGBA result", async () => {
    const result = await service.remove("video", dto);
    expect(result.cutout.id).toBe("cutout");
    expect(assets.upload).toHaveBeenCalledTimes(2);
  });
  it("rejects cross-video sources and out-of-bounds crops before worker", async () => {
    await expect(service.remove("other", dto)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.remove("video", { ...dto, crop: { ...dto.crop, x: 39 } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects opaque worker output without persisting assets", async () => {
    const png = await sharp({
      create: { width: 16, height: 20, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(png), {
        headers: { "content-type": "image/png" },
      }),
    );
    await expect(service.remove("video", dto)).rejects.toMatchObject({
      status: 502,
    });
    expect(assets.upload).not.toHaveBeenCalled();
  });
  it("rolls back original crop when second write fails", async () => {
    assets.upload
      .mockReset()
      .mockResolvedValueOnce({ id: "crop" })
      .mockRejectedValueOnce(new Error("disk full"));
    await expect(service.remove("video", dto)).rejects.toThrow("disk full");
    expect(assets.deleteGenerated).toHaveBeenCalledWith("crop");
  });
  it("returns unavailable and releases request lock after worker fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(service.remove("video", dto)).rejects.toMatchObject({
      status: 503,
    });
    await expect(service.remove("video", dto)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
