import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Video,
  Share2,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { CampaignMaterial } from "./types";
import PublicMaterialsTab from "./PublicMaterialsTab";

const KIND_ICON = { image: ImageIcon, video: Video, pdf: FileText };

interface Props {
  clientId: string;
  clientName: string;
  limit?: number;
  /** Quando true, renderiza só os destaques (sem o botão "ver todos") porque a página já lista o restante. */
  hideViewAll?: boolean;
  /** Callback opcional ao clicar em "Ver todos" — se não passado, abre Dialog interno. */
  onViewAll?: () => void;
}

export default function MateriaisDestaque({
  clientId,
  clientName,
  limit = 3,
  hideViewAll = false,
  onViewAll,
}: Props) {
  const [items, setItems] = useState<CampaignMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from("campaign_materials")
          .select("*")
          .eq("client_id", clientId)
          .eq("status", "published")
          .order("order_index", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("campaign_materials")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("status", "published"),
      ]);
      setItems((data ?? []) as CampaignMaterial[]);
      setTotal(count ?? 0);
      setLoading(false);
    })();
  }, [clientId, limit]);

  async function handleDownload(item: CampaignMaterial) {
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
      <div className="py-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) return null;

  const handleViewAll = () => {
    if (onViewAll) onViewAll();
    else setDialogOpen(true);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base sm:text-lg leading-tight">
            Materiais para você compartilhar
          </h3>
          <p className="text-xs text-muted-foreground">
            Baixe e envie agora nos seus grupos do WhatsApp
          </p>
        </div>
        {total > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {total} no total
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((it) => {
          const Icon = KIND_ICON[it.kind];
          return (
            <Card key={it.id} className="overflow-hidden flex flex-col border-2 border-primary/20 hover:border-primary/40 transition-colors">
              <div className="aspect-video bg-muted flex items-center justify-center relative">
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
                <Badge
                  variant="secondary"
                  className="absolute top-2 left-2 text-[10px] bg-background/90 backdrop-blur"
                >
                  <Icon className="w-3 h-3 mr-1" />
                  {it.kind === "image" ? "Imagem" : it.kind === "video" ? "Vídeo" : "PDF"}
                </Badge>
              </div>
              <div className="p-3 space-y-2 flex-1 flex flex-col">
                <p className="text-sm font-semibold leading-tight line-clamp-2">{it.title}</p>
                <div className="flex gap-2 mt-auto pt-1">
                  <Button size="sm" className="flex-1" onClick={() => handleDownload(it)}>
                    <Download className="w-4 h-4 mr-1.5" />
                    Baixar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
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

      {!hideViewAll && total > items.length && (
        <div className="relative">
          {/* Halo pulsante */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-2xl bg-primary/40 blur-lg animate-pulse"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-primary/60 animate-ping"
          />
          <Button
            variant="default"
            size="lg"
            onClick={handleViewAll}
            className="relative w-full gap-3 font-extrabold text-base sm:text-lg py-7 rounded-2xl shadow-xl shadow-primary/40 border-2 border-primary-foreground/20 hover:scale-[1.02] transition-transform animate-pulse"
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-center leading-tight">
              👉 VER TODOS OS {total} MATERIAIS
              <span className="block text-[11px] sm:text-xs font-medium opacity-90 mt-0.5">
                Toque aqui para baixar tudo
              </span>
            </span>
            <ArrowRight className="w-5 h-5 shrink-0 animate-bounce-x" />
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Materiais de campanha — {clientName}</DialogTitle>
          </DialogHeader>
          <PublicMaterialsTab clientId={clientId} clientName={clientName} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
