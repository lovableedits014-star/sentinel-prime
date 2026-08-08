import { supabase } from "@/integrations/supabase/client-selfhosted";
import type { BatchItem } from "./useBatchRenderer";


const BUCKET = "campaign-frame-assets";

export interface PublishProgress {
  done: number;
  total: number;
}

export async function publishItemsToGallery(opts: {
  clientId: string;
  galleryId: string;
  items: BatchItem[];
  startIndex?: number;
  onProgress?: (p: PublishProgress) => void;
}): Promise<{ uploaded: number; failed: number; firstUrl: string | null }> {
  const ready = opts.items.filter((i) => i.status === "ready" && i.resultUrl);
  let uploaded = 0;
  let failed = 0;
  let firstUrl: string | null = null;
  const start = opts.startIndex ?? 0;

  for (let i = 0; i < ready.length; i++) {
    const it = ready[i];
    try {
      const resp = await fetch(it.resultUrl!);
      const blob = await resp.blob();
      const itemId =
        (crypto as any).randomUUID?.() ?? `${Date.now()}-${i}`;
      const path = `${opts.clientId}/gallery/${opts.galleryId}/${itemId}.jpg`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      if (!firstUrl) firstUrl = publicUrl;

      const { error: insErr } = await supabase
        .from("campaign_photo_gallery_items")
        .insert({
          gallery_id: opts.galleryId,
          client_id: opts.clientId,
          original_file_name: it.fileName,
          storage_path: path,
          public_url: publicUrl,
          order_index: i,
        });
      if (insErr) throw insErr;
      uploaded += 1;
    } catch (e) {
      failed += 1;
      console.error("publish item failed", e);
    }
    opts.onProgress?.({ done: i + 1, total: ready.length });
  }

  return { uploaded, failed, firstUrl };
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function publishRawFilesToGallery(opts: {
  clientId: string;
  galleryId: string;
  files: File[];
  startIndex?: number;
  watermarkLogo?: string;
  logoSettings?: any;
  onProgress?: (p: PublishProgress) => void;
}): Promise<{ uploaded: number; failed: number; firstUrl: string | null }> {
  const files = opts.files;
  const start = opts.startIndex ?? 0;
  let uploaded = 0;
  let failed = 0;
  let firstUrl: string | null = null;

  // Carrega logo se houver
  let logoImg: HTMLImageElement | null = null;
  if (opts.watermarkLogo) {
    try {
      logoImg = await new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = opts.watermarkLogo!;
      });
    } catch (e) {
      console.error("Erro ao carregar logo para marca d'água", e);
    }
  }

  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    try {
      const isHEIC = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
      
      // Se for HEIC, precisamos converter antes de tentar carregar no Image/Canvas
      if (isHEIC) {
        try {
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.85
          });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          file = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
        } catch (convErr) {
          console.error("Erro na conversão HEIC durante publicação:", convErr);
          throw new Error("Não foi possível converter o formato HEIC do iPhone");
        }
      }

      // Sempre processamos pelo canvas para garantir:
      // 1. Redimensionamento para economia de espaço
      // 2. Aplicação de Logo opcional
      const img: HTMLImageElement = await new Promise((res, rej) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          res(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          rej(new Error("Não foi possível carregar a imagem selecionada"));
        };
        img.src = url;
      });

      const canvas = document.createElement("canvas");
      // Limitar dimensão máxima para economizar espaço
      const MAX_DIM = 2048;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");
      
      ctx.drawImage(img, 0, 0, width, height);

      // Aplica logo se configurado
      if (logoImg) {
        const logoSettings = opts.logoSettings || { position: "bottom-right", size: 15, margin: 3, opacity: 0.8 };
        const sizePercent = (logoSettings.size || 15) / 100;
        const marginPercent = (logoSettings.margin || 3) / 100;
        
        const logoSize = Math.min(width, height) * sizePercent;
        const aspect = logoImg.height / logoImg.width;
        const lw = logoSize;
        const lh = logoSize * aspect;
        const margin = Math.min(width, height) * marginPercent;
        
        let lx = width - lw - margin;
        let ly = height - lh - margin;

        if (logoSettings.position === "bottom-left") {
          lx = margin;
        } else if (logoSettings.position === "top-right") {
          ly = margin;
        } else if (logoSettings.position === "top-left") {
          lx = margin;
          ly = margin;
        } else if (logoSettings.position === "center") {
          lx = (width - lw) / 2;
          ly = (height - lh) / 2;
        }

        ctx.globalAlpha = logoSettings.opacity ?? 0.8;
        ctx.drawImage(logoImg, lx, ly, lw, lh);
        ctx.globalAlpha = 1.0;
      }

      const finalBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
      
      const itemId = (crypto as any).randomUUID?.() ?? `${Date.now()}-${i}`;
      const path = `${opts.clientId}/gallery/${opts.galleryId}/${itemId}.jpg`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, finalBlob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      if (!firstUrl) firstUrl = publicUrl;

      const { error: insErr } = await supabase
        .from("campaign_photo_gallery_items")
        .insert({
          gallery_id: opts.galleryId,
          client_id: opts.clientId,
          original_file_name: file.name.replace(/\.(heic|heif)$/i, ".jpg"),
          storage_path: path,
          public_url: publicUrl,
          order_index: start + i,
        });
      if (insErr) throw insErr;
      uploaded += 1;
    } catch (e) {
      failed += 1;
      console.error("publish raw file failed", e);
    }
    opts.onProgress?.({ done: i + 1, total: files.length });
  }

  return { uploaded, failed, firstUrl };
}

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `g-${Date.now()}`;
}
