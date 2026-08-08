import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import { FrameComposition, preloadComposition, renderComposition } from "./types";
import { saveBlob } from "@/lib/mobile-download";

export interface BatchItem {
  id: string;
  fileName: string;
  originalUrl: string;
  image: HTMLImageElement | null;
  zoom: number;
  offset: { x: number; y: number };
  status: "queued" | "processing" | "ready" | "error";
  error?: string;
  resultUrl?: string;
}

export const BATCH_MAX = 99999; // Aumentado para "ilimitado" conforme solicitado
export const BATCH_MAX_FILE_MB = 25; // Aumentado para 25MB conforme solicitado
export const OUTPUT_MIME = "image/jpeg";
export const OUTPUT_QUALITY = 0.85; // Leve aumento na qualidade
export const OUTPUT_EXT = "jpg";
const CONCURRENCY = 3;
const CANVAS_SIZE = 1080;
const MAX_DIMENSION = 2048; // Redimensionar se maior que isso para economizar espaço

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("falha ao carregar"));
    img.src = url;
  });
}

export function useBatchRenderer(composition: FrameComposition | null) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const compRef = useRef<FrameComposition | null>(composition);
  compRef.current = composition;

  const ensureCache = useCallback(async () => {
    if (!compRef.current) return;
    cacheRef.current = await preloadComposition(compRef.current);
  }, []);

  const renderOne = useCallback(async (item: BatchItem): Promise<BatchItem> => {
    const comp = compRef.current;
    if (!comp || !item.image) return { ...item, status: "error", error: "sem moldura" };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = comp.canvas.width;
      canvas.height = comp.canvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas ctx");
      await renderComposition(ctx, comp, {
        photo: item.image,
        photoZoom: item.zoom,
        photoOffset: item.offset,
        imageCache: cacheRef.current,
      });
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, OUTPUT_MIME, OUTPUT_QUALITY));
      if (!blob) throw new Error("toBlob");
      if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
      return { ...item, status: "ready", resultUrl: URL.createObjectURL(blob), error: undefined };
    } catch (e: any) {
      return { ...item, status: "error", error: e?.message ?? "erro" };
    }
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const rerenderItem = useCallback(async (id: string) => {
    await ensureCache();
    const target = items.find((i) => i.id === id);
    if (!target) return;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status: "processing" } : it)));
    const fresh = await renderOne(target);
    setItems((cur) => cur.map((it) => (it.id === id ? fresh : it)));
  }, [ensureCache, items, renderOne]);

  const rerenderItemWith = useCallback(async (id: string, patch: Partial<BatchItem>) => {
    await ensureCache();
    const base = items.find((i) => i.id === id);
    if (!base) return;
    const merged: BatchItem = { ...base, ...patch, status: "processing" };
    setItems((cur) => cur.map((it) => (it.id === id ? merged : it)));
    const fresh = await renderOne(merged);
    setItems((cur) => cur.map((it) => (it.id === id ? fresh : it)));
  }, [ensureCache, items, renderOne]);

  const addFiles = useCallback(async (files: File[]) => {
    const available = BATCH_MAX - items.length;
    const accept = files.slice(0, available).filter((f) => {
      const isHEIC = /\.(heic|heif)$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif";
      return (f.type.startsWith("image/") || isHEIC) && f.size <= BATCH_MAX_FILE_MB * 1024 * 1024;
    });

    const created: BatchItem[] = [];
    setProgress({ done: 0, total: accept.length });
    for (let i = 0; i < accept.length; i++) {
      let f = accept[i];
      setProgress({ done: i, total: accept.length });
      const isHEIC = /\.(heic|heif)$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif";
      
      if (isHEIC) {
        try {
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({
            blob: f,
            toType: "image/jpeg",
            quality: 0.85
          });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          f = new File([blob], f.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
        } catch (err) {
          console.error("HEIC conversion error", err);
          created.push({
            id: crypto.randomUUID(),
            fileName: f.name,
            originalUrl: "",
            image: null,
            zoom: 1,
            offset: { x: 0, y: 0 },
            status: "error",
            error: "não foi possível converter HEIC",
          });
          continue;
        }
      }

      const url = URL.createObjectURL(f);
      let img: HTMLImageElement | null = null;
      try { 
        img = await loadImage(url); 
      } catch (e) { 
        console.error("Erro ao carregar imagem para Canvas:", f.name, e);
        // Tentar um fallback forçando o recarregamento
        try {
          await new Promise(r => setTimeout(r, 150));
          img = await loadImage(url);
        } catch (e2) {
          console.error("Segunda tentativa falhou:", f.name, e2);
        }
      }
      
      if (!img) {
        URL.revokeObjectURL(url);
      }
      
      created.push({
        id: crypto.randomUUID(),
        fileName: f.name,
        originalUrl: url,
        image: img,
        zoom: 1,
        offset: { x: 0, y: 0 },
        status: img ? "queued" : "error",
        error: img ? undefined : "falha técnica ao ler arquivo (tente novamente)",
      });
      setProgress({ done: i + 1, total: accept.length });
    }
    setItems((cur) => [...cur, ...created]);

    // Process in parallel with limited concurrency
    await ensureCache();
    setProgress({ done: 0, total: created.filter((c) => c.status === "queued").length });
    let doneCount = 0;
    const queue = [...created.filter((c) => c.status === "queued")];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        setItems((cur) => cur.map((it) => (it.id === next.id ? { ...it, status: "processing" } : it)));
        const out = await renderOne(next);
        setItems((cur) => cur.map((it) => (it.id === next.id ? out : it)));
        doneCount += 1;
        setProgress((p) => (p ? { ...p, done: doneCount } : p));
      }
    });
    await Promise.all(workers);
    setProgress(null);
  }, [items.length, ensureCache, renderOne]);

  const removeItem = useCallback((id: string) => {
    setItems((cur) => {
      const it = cur.find((x) => x.id === id);
      if (it?.resultUrl) URL.revokeObjectURL(it.resultUrl);
      if (it?.originalUrl) URL.revokeObjectURL(it.originalUrl);
      return cur.filter((x) => x.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((cur) => {
      cur.forEach((it) => {
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
        if (it.originalUrl) URL.revokeObjectURL(it.originalUrl);
      });
      return [];
    });
  }, []);

  const rerenderAll = useCallback(async () => {
    await ensureCache();
    const targets = items.filter((i) => i.image);
    setProgress({ done: 0, total: targets.length });
    let doneCount = 0;
    const queue = [...targets];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const next = queue.shift()!;
        setItems((cur) => cur.map((it) => (it.id === next.id ? { ...it, status: "processing" } : it)));
        const out = await renderOne(next);
        setItems((cur) => cur.map((it) => (it.id === next.id ? out : it)));
        doneCount += 1;
        setProgress((p) => (p ? { ...p, done: doneCount } : p));
      }
    });
    await Promise.all(workers);
    setProgress(null);
  }, [ensureCache, items, renderOne]);

  const downloadZip = useCallback(async () => {
    const ready = items.filter((i) => i.status === "ready" && i.resultUrl);
    if (!ready.length) return;
    const zip = new JSZip();
    for (let i = 0; i < ready.length; i++) {
      const it = ready[i];
      const resp = await fetch(it.resultUrl!);
      const blob = await resp.blob();
      const safeName = (it.fileName.replace(/\.[^.]+$/, "") || `foto-${i + 1}`).replace(/[^a-z0-9-_]+/gi, "_");
      zip.file(`${String(i + 1).padStart(2, "0")}-${safeName}.${OUTPUT_EXT}`, blob);
    }
    const out = await zip.generateAsync({ type: "blob" });
    await saveBlob(out, `fotos-campanha-${Date.now()}.zip`, { title: "Fotos de campanha", preferDownload: true });
  }, [items]);

  const downloadOne = useCallback(async (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it?.resultUrl) return;
    const filename = `${it.fileName.replace(/\.[^.]+$/, "") || "foto"}-campanha.${OUTPUT_EXT}`;
    try {
      const resp = await fetch(it.resultUrl);
      const blob = await resp.blob();
      await saveBlob(blob, filename, { title: "Foto de campanha", preferDownload: true });
    } catch {
      // Fallback bem básico
      window.open(it.resultUrl, "_blank");
    }
  }, [items]);

  return {
    items,
    progress,
    addFiles,
    updateItem,
    rerenderItem,
    rerenderItemWith,
    removeItem,
    clearAll,
    rerenderAll,
    downloadZip,
    downloadOne,
            CANVAS_SIZE,
  };
}

export { CANVAS_SIZE };
