import { supabase } from "@/integrations/supabase/client-selfhosted";
import type { BatchItem } from "./useBatchRenderer";
import heic2any from "heic2any";

const BUCKET = "campaign-frame-assets";

export interface PublishProgress {
  done: number;
  total: number;
}

export async function publishItemsToGallery(opts: {
  clientId: string;
  galleryId: string;
  items: BatchItem[];
  onProgress?: (p: PublishProgress) => void;
}): Promise<{ uploaded: number; failed: number; firstUrl: string | null }> {
  const ready = opts.items.filter((i) => i.status === "ready" && i.resultUrl);
  let uploaded = 0;
  let failed = 0;
  let firstUrl: string | null = null;

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

/** Publica arquivos já prontos (sem aplicar moldura) na galeria. */
export async function publishRawFilesToGallery(opts: {
  clientId: string;
  galleryId: string;
  files: File[];
  startIndex?: number;
  onProgress?: (p: PublishProgress) => void;
}): Promise<{ uploaded: number; failed: number; firstUrl: string | null }> {
  const files = opts.files;
  const start = opts.startIndex ?? 0;
  let uploaded = 0;
  let failed = 0;
  let firstUrl: string | null = null;

  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    try {
      const isHEIC = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
      
      if (isHEIC) {
        try {
          const converted = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.85
          });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          file = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
        } catch (err) {
          console.error("HEIC conversion failed", err);
          // continua com o arquivo original se falhar, ou joga erro se preferir
        }
      }

      const ext = EXT_BY_TYPE[file.type] || (file.name.split(".").pop() || "jpg").toLowerCase();
      const itemId = (crypto as any).randomUUID?.() ?? `${Date.now()}-${i}`;
      const path = `${opts.clientId}/gallery/${opts.galleryId}/${itemId}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      if (!firstUrl) firstUrl = publicUrl;

      const { error: insErr } = await supabase
        .from("campaign_photo_gallery_items")
        .insert({
          gallery_id: opts.galleryId,
          client_id: opts.clientId,
          original_file_name: file.name,
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
