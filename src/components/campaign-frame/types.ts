export interface FrameLayer {
  id: string;
  name: string;
  imageUrl: string;
  /** Center X in canvas coordinates (0..canvas.width) */
  x: number;
  /** Center Y in canvas coordinates */
  y: number;
  /** Uniform scale (1 = original size) */
  scale: number;
  /** Rotation in degrees */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

export interface FrameComposition {
  canvas: { width: number; height: number };
  background:
    | { type: "color"; color: string }
    | { type: "image"; imageUrl: string; color?: string };
  /** Where the user photo gets clipped into a circle */
  photoCircle: { cx: number; cy: number; r: number };
  /** Stacked top-down: index 0 renders first (bottom) above the photo */
  layers: FrameLayer[];
}

export const DEFAULT_COMPOSITION: FrameComposition = {
  canvas: { width: 1080, height: 1080 },
  background: { type: "color", color: "#ffffff" },
  photoCircle: { cx: 540, cy: 540, r: 380 },
  layers: [],
};

export function newLayer(imageUrl: string, name = "Elemento"): FrameLayer {
  return {
    id: crypto.randomUUID(),
    name,
    imageUrl,
    x: 540,
    y: 540,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
}

/**
 * Render a composition + (optional) user photo into a target canvas.
 * `photoTransform` lets the caller control how the user photo fits inside the circle.
 */
export async function renderComposition(
  ctx: CanvasRenderingContext2D,
  comp: FrameComposition,
  opts: {
    photo?: HTMLImageElement | null;
    photoZoom?: number;
    photoOffset?: { x: number; y: number };
    /** Pre-loaded image cache (imageUrl -> HTMLImageElement) */
    imageCache: Map<string, HTMLImageElement>;
  },
) {
  const { width, height } = comp.canvas;
  ctx.clearRect(0, 0, width, height);

  // 1. Background
  if (comp.background.type === "color") {
    ctx.fillStyle = comp.background.color;
    ctx.fillRect(0, 0, width, height);
  } else {
    if (comp.background.color) {
      ctx.fillStyle = comp.background.color;
      ctx.fillRect(0, 0, width, height);
    }
    const bgImg = opts.imageCache.get(comp.background.imageUrl);
    if (bgImg) {
      // cover-fit
      const s = Math.max(width / bgImg.width, height / bgImg.height);
      const w = bgImg.width * s;
      const h = bgImg.height * s;
      ctx.drawImage(bgImg, (width - w) / 2, (height - h) / 2, w, h);
    }
  }

  // 2. Photo clipped to circle
  const { cx, cy, r } = comp.photoCircle;
  if (opts.photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const photo = opts.photo;
    const baseScale = Math.max((r * 2) / photo.width, (r * 2) / photo.height);
    const scale = baseScale * (opts.photoZoom ?? 1);
    const drawW = photo.width * scale;
    const drawH = photo.height * scale;
    const off = opts.photoOffset ?? { x: 0, y: 0 };
    ctx.drawImage(photo, cx - drawW / 2 + off.x, cy - drawH / 2 + off.y, drawW, drawH);
    ctx.restore();
  } else {
    // placeholder
    ctx.save();
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Overlay layers (in order)
  for (const layer of comp.layers) {
    const img = opts.imageCache.get(layer.imageUrl);
    if (!img) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(layer.x, layer.y);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    const w = img.width * layer.scale;
    const h = img.height * layer.scale;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

/** Preload all images referenced by a composition. */
export async function preloadComposition(comp: FrameComposition): Promise<Map<string, HTMLImageElement>> {
  const urls = new Set<string>();
  if (comp.background.type === "image") urls.add(comp.background.imageUrl);
  for (const l of comp.layers) urls.add(l.imageUrl);
  const cache = new Map<string, HTMLImageElement>();
  await Promise.all(
    Array.from(urls).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            cache.set(url, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
  return cache;
}