// Decodes texture-set maps into one texture array's layers, off the main thread (render/textures.ts): each URL is a
// square WebP, scaled to `size` and stacked in order. No colour management: normal and ORM maps are data, and the
// colour maps' sRGB bytes are decoded by the GPU.

interface Job {
  id: number;
  urls: string[];
  size: number;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, urls, size } = e.data;
  try {
    const canvas = new OffscreenCanvas(size, size);
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    const out = new Uint8Array(urls.length * size * size * 4);
    for (let i = 0; i < urls.length; i++) {
      const r = await fetch(urls[i]);
      if (!r.ok) throw new Error(`${urls[i]}: HTTP ${r.status}`);
      const bmp = await createImageBitmap(await r.blob(), { resizeWidth: size, resizeHeight: size, resizeQuality: "high", colorSpaceConversion: "none", premultiplyAlpha: "none" });
      g.clearRect(0, 0, size, size);
      g.drawImage(bmp, 0, 0);
      bmp.close();
      out.set(g.getImageData(0, 0, size, size).data, i * size * size * 4);
    }
    (self as unknown as Worker).postMessage({ id, data: out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
