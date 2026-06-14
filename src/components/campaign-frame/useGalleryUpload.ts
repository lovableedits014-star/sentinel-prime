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
      const path = `${opts.clientId}/gallery/${opts.galleryId}/${itemId}.png`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/png", upsert: false });
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

export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `g-${Date.now()}`;
}
