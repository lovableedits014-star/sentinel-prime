import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Video,
  Search,
  Share2,
  Loader2,
} from "lucide-react";
import { CampaignMaterial, formatSize } from "./types";

const KIND_ICON = { image: ImageIcon, video: Video, pdf: FileText };
const KIND_LABEL = { image: "Imagem", video: "Vídeo", pdf: "PDF" };

type FilterKind = "all" | "image" | "video" | "pdf";

export default function PublicMaterialsTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [items, setItems] = useState<CampaignMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<FilterKind>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("campaign_materials")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "published")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: false });
      setItems((data ?? []) as CampaignMaterial[]);
      setLoading(false);
    })();
  }, [clientId]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (kindFilter !== "all" && i.kind !== kindFilter) return false;
      if (activeTag && !i.tags.includes(activeTag)) return false;
      if (q && !i.title.toLowerCase().includes(q) && !(i.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, search, kindFilter, activeTag]);

  async function handleDownload(item: CampaignMaterial) {
    // Increment counter in background (anônimo via RPC SECURITY DEFINER)
    void supabase.rpc("increment_material_download" as any, { _material_id: item.id });
    setItems((arr) =>
      arr.map((x) => (x.id === item.id ? { ...x, download_count: x.download_count + 1 } : x)),
    );
    const filename = item.storage_path.split("/").pop() || item.title;
    const { saveUrl } = await import("@/lib/mobile-download");
    await saveUrl(item.public_url, filename, { title: item.title });
  }

  function shareWhatsApp(item: CampaignMaterial) {
    const text = `${item.title} — material de campanha de ${clientName}\n${item.public_url}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto opacity-40 mb-2" />
          Nenhum material disponível ainda. Volte em breve!
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar materiais…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "image", "video", "pdf"] as FilterKind[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kindFilter === k ? "default" : "outline"}
              onClick={() => setKindFilter(k)}
            >
              {k === "all" ? "Todos" : KIND_LABEL[k]}
            </Button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeTag && (
              <Badge
                variant="default"
                className="cursor-pointer"
                onClick={() => setActiveTag(null)}
              >
                ✕ {activeTag}
              </Badge>
            )}
            {!activeTag &&
              allTags.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => setActiveTag(t)}
                >
                  {t}
                </Badge>
              ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum material encontrado com esses filtros.
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((it) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <Card key={it.id} className="overflow-hidden flex flex-col">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  {it.kind === "image" ? (
                    <img
                      src={it.public_url}
                      alt={it.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : it.kind === "video" ? (
                    <video
                      src={it.public_url}
                      poster={it.cover_url ?? undefined}
                      controls
                      preload="metadata"
                      className="w-full h-full object-cover bg-black"
                    />
                  ) : it.cover_url ? (
                    <img
                      src={it.cover_url}
                      alt={it.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FileText className="w-10 h-10 opacity-40" />
                      <span className="text-xs mt-1">PDF</span>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{it.title}</p>
                      {it.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {it.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {it.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {it.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {formatSize(it.size_bytes)} · {it.download_count} downloads
                  </p>
                  <div className="flex gap-2 mt-auto pt-2">
                    <Button size="sm" className="flex-1" onClick={() => handleDownload(it)}>
                      <Download className="w-4 h-4 mr-1.5" />
                      Baixar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => shareWhatsApp(it)}
                      title="Compartilhar no WhatsApp"
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
