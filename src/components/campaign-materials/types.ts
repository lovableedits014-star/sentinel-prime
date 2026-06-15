export type MaterialKind = "image" | "video" | "pdf";

export interface CampaignMaterial {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  tags: string[];
  kind: MaterialKind;
  mime_type: string;
  storage_path: string;
  public_url: string;
  cover_url: string | null;
  size_bytes: number;
  download_count: number;
  order_index: number;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
}

export const MATERIAL_BUCKET = "campaign-frame-assets";
export const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

export const MIME_TO_KIND: Record<string, MaterialKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "application/pdf": "pdf",
};

export function detectKind(file: File): MaterialKind | null {
  const mt = file.type.toLowerCase();
  if (MIME_TO_KIND[mt]) return MIME_TO_KIND[mt];
  // Fallback by extension
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (ext === "mp4") return "video";
  if (ext === "pdf") return "pdf";
  return null;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
